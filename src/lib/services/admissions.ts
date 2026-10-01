import "server-only";
import type {
  Application,
  ApplicationStage,
  Payment,
  PaymentOrder,
  Prisma,
  Receipt,
  Role,
} from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { can } from "@/lib/rbac";
import { emitLeadEvent, sendTemplate } from "@/lib/notify";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { dobFromParts } from "@/lib/schemas/common";
import type { BoardingStep, ChildStep, ParentsStep } from "@/lib/schemas/registration";
import { school } from "@/config/school";
import { createInvoice } from "./invoices";
import type { Effect } from "./payments";

export const STAGE_LABEL: Record<ApplicationStage, string> = {
  DRAFT: "Draft",
  REGISTERED: "Registered",
  DOCUMENTS: "Document check",
  ASSESSMENT: "Assessment",
  REVIEW: "Review",
  OFFER: "Offer made",
  FEE_PAID: "Fee paid",
  ADMITTED: "Admitted",
  WAITLISTED: "Waitlisted",
  REJECTED: "Not offered",
  WITHDRAWN: "Withdrawn",
};

export const PIPELINE: ApplicationStage[] = [
  "REGISTERED",
  "DOCUMENTS",
  "ASSESSMENT",
  "REVIEW",
  "OFFER",
  "FEE_PAID",
  "ADMITTED",
];
export const CLOSED: ApplicationStage[] = ["WAITLISTED", "REJECTED", "WITHDRAWN"];

/** Allowed stage transitions. FEE_PAID is normally set by the payment pipeline; staff may set it for offline payments. */
export const TRANSITIONS: Record<ApplicationStage, ApplicationStage[]> = {
  DRAFT: ["REGISTERED", "WITHDRAWN"],
  REGISTERED: ["DOCUMENTS", "ASSESSMENT", "WAITLISTED", "REJECTED", "WITHDRAWN"],
  DOCUMENTS: ["ASSESSMENT", "REJECTED", "WITHDRAWN"],
  ASSESSMENT: ["REVIEW", "WITHDRAWN"],
  REVIEW: ["OFFER", "WAITLISTED", "REJECTED", "WITHDRAWN"],
  OFFER: ["FEE_PAID", "REJECTED", "WITHDRAWN"],
  FEE_PAID: ["ADMITTED", "WITHDRAWN"],
  ADMITTED: [],
  WAITLISTED: ["OFFER", "REJECTED", "WITHDRAWN"],
  REJECTED: ["REVIEW"],
  WITHDRAWN: [],
};

/** Decisions need elevated permission. */
const DECISIONS: ApplicationStage[] = ["OFFER", "WAITLISTED", "REJECTED", "ADMITTED"];

const FAMILY_MESSAGE: Partial<Record<ApplicationStage, string>> = {
  DOCUMENTS: "We're checking the documents you uploaded. We'll let you know if anything else is needed.",
  ASSESSMENT:
    "Your daughter's assessment and interaction have been scheduled. Details are in your applicant dashboard.",
  REVIEW: "Thank you for coming in. The admissions panel is now reviewing the application.",
  FEE_PAID: "We've received the fee — your daughter's place is confirmed. Welcome to Aurelia Hall!",
  ADMITTED: "Admission is complete. You'll receive parent portal access and an orientation pack shortly.",
  WAITLISTED:
    "We don't have a place available right now, but we've added your daughter to the waiting list and will contact you as soon as one opens.",
  REJECTED:
    "After careful consideration we're unable to offer a place at this time. Thank you for your interest in Aurelia Hall.",
  WITHDRAWN: "The application has been withdrawn. You're welcome to apply again at any time.",
};

async function nextRef(tx: Tx): Promise<string> {
  const yy = String(new Date().getUTCFullYear()).slice(2);
  const key = `APP:${yy}`;
  const row = await tx.receiptSequence.upsert({
    where: { financialYear: key },
    create: { financialYear: key, lastSeq: 1 },
    update: { lastSeq: { increment: 1 } },
  });
  return `${school.applicationPrefix}${yy}-${String(row.lastSeq).padStart(4, "0")}`;
}

export function registrationOptions() {
  return Promise.all([
    db.classLevel.findMany({ orderBy: { order: "asc" } }),
    db.academicYear.findMany({ where: { endDate: { gte: new Date() } }, orderBy: { startDate: "asc" } }),
  ]);
}

/** Registration fee from the fee structure's REG line for that band/year; falls back to config. */
export async function registrationFeeFor(app: Pick<Application, "classId" | "startYearId">): Promise<number> {
  const cls = await db.classLevel.findUniqueOrThrow({ where: { id: app.classId } });
  const line = await db.feeStructureLine.findFirst({
    where: {
      feeHead: { kind: "REGISTRATION" },
      structure: { yearId: app.startYearId, band: cls.band, status: "ACTIVE" },
    },
    orderBy: { structure: { version: "desc" } },
  });
  return line?.amountPaise ?? school.registrationFeePaise;
}

export async function createDraftApplication(child: ChildStep, utm?: Record<string, string>) {
  const dob = dobFromParts(child.dobDay, child.dobMonth, child.dobYear)!;
  return db.$transaction(async (tx) => {
    const ref = await nextRef(tx);
    const app = await tx.application.create({
      data: {
        ref,
        stage: "DRAFT",
        childFirstName: child.childFirstName,
        childLastName: child.childLastName,
        dob,
        gender: child.gender,
        currentSchool: child.currentSchool || null,
        classId: child.classId,
        startYearId: child.startYearId,
        boardingType: "DAY",
        guardians: [],
        contactEmail: "",
        contactPhone: "",
        utm: utm ?? undefined,
      },
    });
    await tx.applicationEvent.create({
      data: { applicationId: app.id, toStage: "DRAFT", note: "Registration started online" },
    });
    return app;
  });
}

export async function updateDraft(
  id: string,
  data: { child?: ChildStep; parents?: ParentsStep; boarding?: BoardingStep; declared?: boolean },
) {
  const app = await db.application.findUniqueOrThrow({ where: { id } });
  if (app.stage !== "DRAFT")
    throw new ApiError(409, "NOT_DRAFT", "This registration has already been submitted.");
  const patch: Prisma.ApplicationUpdateInput = {};
  if (data.child) {
    patch.childFirstName = data.child.childFirstName;
    patch.childLastName = data.child.childLastName;
    patch.dob = dobFromParts(data.child.dobDay, data.child.dobMonth, data.child.dobYear)!;
    patch.gender = data.child.gender;
    patch.currentSchool = data.child.currentSchool || null;
    patch.class = { connect: { id: data.child.classId } };
    patch.startYear = { connect: { id: data.child.startYearId } };
  }
  if (data.parents) {
    patch.guardians = data.parents.guardians.filter((g) => g.name) as unknown as Prisma.InputJsonValue;
    patch.contactEmail = data.parents.contactEmail;
    patch.contactPhone = data.parents.contactPhone;
  }
  if (data.boarding) {
    patch.boardingType = data.boarding.boardingType;
    patch.scholarshipInterest = data.boarding.scholarshipInterest;
  }
  if (data.declared) patch.declarationAt = new Date();
  return db.application.update({ where: { id }, data: patch });
}

type GuardianJson = {
  relation: string;
  name: string;
  occupation?: string;
  phone?: string;
  email?: string;
  address?: string;
};

/** Payment pipeline hook: registration fee captured → REGISTERED, applicant login, lead linked, receipt email. */
export async function onRegistrationPaid(
  tx: Tx,
  order: PaymentOrder,
  payment: Payment,
  receipt: Receipt,
): Promise<Effect[]> {
  if (!order.applicationId) return [];
  const app = await tx.application.findUniqueOrThrow({
    where: { id: order.applicationId },
    include: { class: true },
  });
  if (app.stage !== "DRAFT") return [];
  const primary = ((app.guardians as GuardianJson[])[0] ?? { name: "Parent" }) as GuardianJson;

  let user = await tx.user.findUnique({ where: { email: app.contactEmail } });
  if (!user)
    user = await tx.user.create({ data: { email: app.contactEmail, name: primary.name, role: "APPLICANT" } });

  const digits = app.contactPhone.replace(/\D/g, "").slice(-10);
  const lead = await tx.lead.findFirst({
    where: { mergedIntoId: null, OR: [{ email: app.contactEmail }, { phone: { contains: digits } }] },
    orderBy: { createdAt: "desc" },
  });
  if (lead) {
    await tx.lead.update({
      where: { id: lead.id },
      data: {
        status: "APPLIED",
        activities: {
          create: {
            kind: "STATUS",
            body: `Registered online — application ${app.ref}`,
            meta: { applicationId: app.id },
          },
        },
      },
    });
  }

  await tx.application.update({
    where: { id: app.id },
    data: {
      stage: "REGISTERED",
      registrationPaidAt: payment.receivedAt,
      applicantUserId: user.id,
      leadId: lead?.id ?? app.leadId,
    },
  });
  await tx.applicationEvent.create({
    data: {
      applicationId: app.id,
      fromStage: "DRAFT",
      toStage: "REGISTERED",
      note: `Registration fee received (${receipt.number})`,
    },
  });
  for (const kind of ["BIRTH_CERTIFICATE", "REPORT_CARD", "PHOTO", "ID_PROOF"]) {
    await tx.applicationDocument.upsert({
      where: { applicationId_kind: { applicationId: app.id, kind } },
      create: { applicationId: app.id, kind },
      update: {},
    });
  }

  return [
    () =>
      sendTemplate({
        template: "registration-receipt",
        to: { email: app.contactEmail, phone: app.contactPhone },
        data: {
          parentName: primary.name,
          childName: `${app.childFirstName} ${app.childLastName}`,
          ref: app.ref,
          amount: formatINR(payment.amountPaise),
          receipt: receipt.number,
          email: app.contactEmail,
        },
        related: { type: "application", id: app.id },
      }).then(() => undefined),
    () =>
      emitLeadEvent("application.registered", {
        applicationId: app.id,
        leadId: lead?.id,
        status: "REGISTERED",
        parent: { name: primary.name, email: app.contactEmail, phone: app.contactPhone },
        child: {
          name: `${app.childFirstName} ${app.childLastName}`,
          dob: app.dob.toISOString().slice(0, 10),
          classApplying: app.class.name,
          boarding: app.boardingType,
        },
      }),
  ];
}

/** Creates (or returns) the provisional student for an application, linking existing guardians so siblings are detected. */
async function ensureProspectiveStudent(tx: Tx, app: Application) {
  const existing = await tx.student.findUnique({ where: { applicationId: app.id } });
  if (existing) return existing;
  const student = await tx.student.create({
    data: {
      admissionNo: `P-${app.ref}`,
      firstName: app.childFirstName,
      lastName: app.childLastName,
      dob: app.dob,
      gender: app.gender,
      classId: app.classId,
      boardingType: app.boardingType,
      status: "PROSPECTIVE",
      admittedOn: (await tx.academicYear.findUniqueOrThrow({ where: { id: app.startYearId } })).startDate,
      applicationId: app.id,
    },
  });
  const guardians = (app.guardians as GuardianJson[]).filter((g) => g.name);
  for (const [i, g] of guardians.entries()) {
    const digits = (g.phone ?? "").replace(/\D/g, "").slice(-10);
    const match = await tx.guardian.findFirst({
      where: {
        OR: [
          ...(g.email ? [{ email: g.email.toLowerCase() }] : []),
          ...(digits ? [{ phone: { contains: digits } }] : []),
        ],
      },
    });
    const guardian =
      match ??
      (await tx.guardian.create({
        data: {
          name: g.name,
          email: g.email?.toLowerCase() || null,
          phone: g.phone || app.contactPhone,
          occupation: g.occupation || null,
          address: g.address || null,
        },
      }));
    await tx.studentGuardian.create({
      data: {
        studentId: student.id,
        guardianId: guardian.id,
        relation: g.relation,
        isPrimary:
          g.email?.toLowerCase() === app.contactEmail ||
          (i === 0 && !guardians.some((x) => x.email?.toLowerCase() === app.contactEmail)),
      },
    });
  }
  return student;
}

async function nextAdmissionNo(tx: Tx, startYear: string): Promise<string> {
  const key = `ADM:${startYear}`;
  const row = await tx.receiptSequence.upsert({
    where: { financialYear: key },
    create: { financialYear: key, lastSeq: 1 },
    update: { lastSeq: { increment: 1 } },
  });
  return `AH${startYear.slice(2, 4)}${String(row.lastSeq).padStart(4, "0")}`;
}

export type StageExtra = { planCode?: string; position?: number; message?: string; sectionId?: string };

/** Moves an application inside a transaction and returns post-commit effects. `actor` null = system. */
export async function moveStageInTx(
  tx: Tx,
  appId: string,
  to: ApplicationStage,
  actor: { id: string; role: Role } | null,
  note?: string,
  extra: StageExtra = {},
): Promise<Effect[]> {
  const app = await tx.application.findUniqueOrThrow({
    where: { id: appId },
    include: { class: true, startYear: true },
  });
  if (app.stage === to) return [];
  if (!TRANSITIONS[app.stage].includes(to))
    throw new ApiError(
      409,
      "BAD_TRANSITION",
      `Can't move from ${STAGE_LABEL[app.stage]} to ${STAGE_LABEL[to]}.`,
    );
  if (actor && DECISIONS.includes(to) && !can(actor.role, "applications:decide"))
    throw new ApiError(403, "FORBIDDEN", "Only the Principal or Admissions can make decisions.");
  const effects: Effect[] = [];
  const data: Prisma.ApplicationUpdateInput = { stage: to };
  const primary = ((app.guardians as GuardianJson[])[0] ?? { name: "Parent" }) as GuardianJson;
  const childName = `${app.childFirstName} ${app.childLastName}`;

  if (to === "OFFER") {
    const student = await ensureProspectiveStudent(tx, app);
    const hasInvoice = await tx.invoice.findFirst({
      where: { studentId: student.id, yearId: app.startYearId, status: { not: "VOID" } },
    });
    if (!hasInvoice)
      await createInvoice(tx, {
        studentId: student.id,
        yearId: app.startYearId,
        planCode: extra.planCode ?? "THREE",
      });
    data.offerIssuedAt = new Date();
    data.offerExpiresAt = new Date(Date.now() + 14 * 86400_000);
    data.decisionAt = new Date();
    data.waitlistPosition = null;
    effects.push(() =>
      sendTemplate({
        template: "offer-letter",
        to: { email: app.contactEmail, phone: app.contactPhone },
        data: {
          parentName: primary.name,
          childName,
          className: app.class.name,
          boarding: app.boardingType.toLowerCase() + " boarding",
          session: app.startYear.name,
          acceptBy: formatDate(new Date(Date.now() + 14 * 86400_000), "d MMMM yyyy"),
        },
        channels: ["EMAIL"],
        related: { type: "application", id: app.id },
      }).then(() => undefined),
    );
  }
  if (to === "WAITLISTED") {
    const max = await tx.application.aggregate({
      where: { stage: "WAITLISTED", classId: app.classId, startYearId: app.startYearId },
      _max: { waitlistPosition: true },
    });
    data.waitlistPosition = extra.position ?? (max._max.waitlistPosition ?? 0) + 1;
    data.decisionAt = new Date();
  }
  if (to === "REJECTED") {
    data.decisionAt = new Date();
    data.decisionMessage = extra.message ?? null;
  }
  if (to === "WITHDRAWN" || to === "REJECTED") {
    const student = await tx.student.findUnique({ where: { applicationId: app.id } });
    if (student?.status === "PROSPECTIVE") {
      await tx.student.update({
        where: { id: student.id },
        data: { status: "WITHDRAWN", leftOn: new Date() },
      });
      await tx.invoice.updateMany({
        where: { studentId: student.id, paidPaise: 0, status: { in: ["OPEN", "OVERDUE"] } },
        data: { status: "VOID" },
      });
    }
  }
  if (to === "ADMITTED") {
    const student = await ensureProspectiveStudent(tx, app);
    const section =
      (extra.sectionId && (await tx.section.findUnique({ where: { id: extra.sectionId } }))) ||
      (
        await tx.section.findMany({
          where: { classId: app.classId, yearId: app.startYearId },
          include: { _count: { select: { students: true } } },
        })
      ).sort((a, b) => a._count.students - b._count.students)[0] ||
      null;
    const houses = await tx.house.findMany({ include: { _count: { select: { students: true } } } });
    const house = houses.sort((a, b) => a._count.students - b._count.students)[0];
    await tx.student.update({
      where: { id: student.id },
      data: {
        status: "ACTIVE",
        admissionNo: await nextAdmissionNo(tx, app.startYear.name),
        sectionId: section?.id ?? null,
        houseId: house?.id ?? null,
      },
    });
    if (app.applicantUserId) {
      const user = await tx.user.findUniqueOrThrow({ where: { id: app.applicantUserId } });
      if (user.role === "APPLICANT")
        await tx.user.update({ where: { id: user.id }, data: { role: "PARENT" } });
      const g = await tx.guardian.findFirst({ where: { email: user.email } });
      if (g && !g.userId) await tx.guardian.update({ where: { id: g.id }, data: { userId: user.id } });
    }
    if (app.leadId) await tx.lead.update({ where: { id: app.leadId }, data: { status: "ADMITTED" } });
    effects.push(() =>
      emitLeadEvent("application.admitted", {
        applicationId: app.id,
        leadId: app.leadId ?? undefined,
        status: "ADMITTED",
      }),
    );
  }

  await tx.application.update({ where: { id: app.id }, data });
  await tx.applicationEvent.create({
    data: {
      applicationId: app.id,
      actorId: actor?.id,
      fromStage: app.stage,
      toStage: to,
      note: note ?? null,
    },
  });

  if (to !== "OFFER" && FAMILY_MESSAGE[to]) {
    const message = to === "REJECTED" && extra.message ? extra.message : FAMILY_MESSAGE[to];
    effects.push(() =>
      sendTemplate({
        template: "application-status",
        to: { email: app.contactEmail, phone: app.contactPhone },
        data: { parentName: primary.name, ref: app.ref, stageLabel: STAGE_LABEL[to], message },
        related: { type: "application", id: app.id },
      }).then(() => undefined),
    );
  }
  effects.push(() => emitLeadEvent("application.stage_changed", { applicationId: app.id, status: to }));
  return effects;
}

export async function moveStage(
  appId: string,
  to: ApplicationStage,
  actor: { id: string; role: Role },
  note?: string,
  extra: StageExtra = {},
) {
  const before = await db.application.findUniqueOrThrow({ where: { id: appId }, select: { stage: true } });
  const effects = await db.$transaction(async (tx) => {
    const fx = await moveStageInTx(tx, appId, to, actor, note, extra);
    await audit(
      {
        actor,
        action: "application.stage",
        entity: "Application",
        entityId: appId,
        before,
        after: { stage: to, ...extra },
        reason: note,
      },
      tx,
    );
    return fx;
  });
  for (const fx of effects) await fx().catch((e) => console.error("stage effect failed", e));
}

export async function verifyDocument(
  docId: string,
  status: "VERIFIED" | "REJECTED",
  actor: { id: string; role: Role },
  note?: string,
) {
  const doc = await db.applicationDocument.update({
    where: { id: docId },
    data: { status, note: note ?? null, verifiedById: actor.id, verifiedAt: new Date() },
    include: { application: true },
  });
  await audit({
    actor,
    action: `document.${status.toLowerCase()}`,
    entity: "ApplicationDocument",
    entityId: docId,
    after: { kind: doc.kind, status },
    reason: note,
  });
  await db.applicationEvent.create({
    data: {
      applicationId: doc.applicationId,
      actorId: actor.id,
      toStage: doc.application.stage,
      note: `${doc.kind.replace(/_/g, " ").toLowerCase()} ${status.toLowerCase()}${note ? `: ${note}` : ""}`,
    },
  });
  return doc;
}

export type AssessmentScores = {
  english?: number;
  maths?: number;
  reasoning?: number;
  interview?: number;
  comments?: string;
};

export async function saveAssessment(
  appId: string,
  actor: { id: string; role: Role },
  input: { at?: Date | null; scores?: AssessmentScores; reviewNotes?: string },
) {
  const app = await db.application.update({
    where: { id: appId },
    data: {
      ...(input.at !== undefined ? { assessmentAt: input.at } : {}),
      ...(input.scores ? { assessmentScores: input.scores as Prisma.InputJsonValue } : {}),
      ...(input.reviewNotes !== undefined ? { reviewNotes: input.reviewNotes } : {}),
    },
  });
  await audit({
    actor,
    action: "application.assessment",
    entity: "Application",
    entityId: appId,
    after: input,
  });
  return app;
}
