import "server-only";
import type { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { assertCan } from "@/lib/rbac";
import { cursorList, type ListParams } from "@/lib/crm/list";
import {
  DELETION_POLICY,
  REQUEST_KINDS,
  REQUEST_STATUSES,
  appendHandlerNote,
  phoneKeys,
  resolveRequestSchema,
  type PolicyItem,
  type PolicyKey,
} from "./privacy-rules";

/**
 * Privacy requests (the DPDP-style access and erasure queue). Staff mark requests done or rejected with notes, and
 * can compile everything held about an email address into a JSON bundle. Erasure is never automatic: the page shows
 * what a deletion would remove and what the school must keep, and a person carries it out.
 */

type Actor = { id: string; role: Role; name?: string | null; email?: string };

export type RequestFilters = { status?: string; kind?: string };

const day = (d: Date) => d.toISOString().slice(0, 10);

function where(f: RequestFilters): Prisma.DataRequestWhereInput {
  return {
    ...(f.status && (REQUEST_STATUSES as readonly string[]).includes(f.status) ? { status: f.status } : {}),
    ...(f.kind && (REQUEST_KINDS as readonly string[]).includes(f.kind) ? { kind: f.kind } : {}),
  };
}

async function handlerNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (!unique.length) return new Map();
  const users = await db.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, email: true },
  });
  return new Map(users.map((u) => [u.id, u.name ?? u.email]));
}

export async function listDataRequests(actor: Actor, filters: RequestFilters, params: ListParams) {
  assertCan(actor.role, "privacy:manage");
  const { rows, next, prev, total } = await cursorList<Prisma.DataRequestGetPayload<object>>(
    db.dataRequest,
    { where: where(filters) },
    params,
  );
  const names = await handlerNames(rows.map((r) => r.handledById));
  return {
    rows: rows.map((r) => ({ ...r, handledBy: r.handledById ? (names.get(r.handledById) ?? null) : null })),
    next,
    prev,
    total,
  };
}

/** How many requests sit in each status, for the tab labels. */
export async function requestCounts(actor: Actor, kind?: string): Promise<Record<string, number>> {
  assertCan(actor.role, "privacy:manage");
  const groups = await db.dataRequest.groupBy({
    by: ["status"],
    where: where({ kind }),
    _count: { _all: true },
  });
  const counts: Record<string, number> = Object.fromEntries(REQUEST_STATUSES.map((s) => [s, 0]));
  for (const g of groups) counts[g.status] = g._count._all;
  counts.ALL = Object.values(counts).reduce((a, b) => a + b, 0);
  return counts;
}

export async function resolveDataRequest(actor: Actor, id: string, input: unknown) {
  assertCan(actor.role, "privacy:manage");
  const { status, notes } = resolveRequestSchema.parse(input);
  return db.$transaction(async (tx) => {
    const request = await tx.dataRequest.findUnique({ where: { id } });
    if (!request) throw new ApiError(404, "NOT_FOUND", "No such request.");
    const handler = actor.name ?? actor.email ?? "staff";
    const claimed = await tx.dataRequest.updateMany({
      where: { id, status: "OPEN" },
      data: {
        status,
        handledById: actor.id,
        notes: appendHandlerNote(request.notes, handler, status, notes),
      },
    });
    if (claimed.count === 0)
      throw new ApiError(409, "ALREADY_HANDLED", "This request has already been closed.");
    await audit(
      {
        actor,
        action: "privacy.resolve",
        entity: "DataRequest",
        entityId: id,
        before: { status: request.status },
        after: { status, kind: request.kind },
        reason: notes,
      },
      tx,
    );
    return { id, status };
  });
}

// ───────────────────────────── What is held about an email address ─────────────────────────────

/** Everything keyed on the subject: their sign-in, guardian records and the children linked to them. */
async function subjectFacts(subjectEmail: string) {
  const eq = { equals: subjectEmail, mode: "insensitive" as const };
  const user = await db.user.findFirst({
    where: { email: eq },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      createdAt: true,
      lastLoginAt: true,
    },
  });
  const guardians = await db.guardian.findMany({
    where: { OR: [{ email: eq }, ...(user ? [{ userId: user.id }] : [])] },
    include: {
      students: {
        include: {
          student: {
            select: {
              id: true,
              admissionNo: true,
              firstName: true,
              lastName: true,
              dob: true,
              status: true,
              boardingType: true,
              class: { select: { name: true } },
              section: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  const children = new Map<string, (typeof guardians)[number]["students"][number]>();
  for (const g of guardians) for (const link of g.students) children.set(link.studentId, link);
  const studentIds = [...children.keys()];
  const applicationWhere: Prisma.ApplicationWhereInput = {
    OR: [{ contactEmail: eq }, ...(user ? [{ applicantUserId: user.id }] : [])],
  };
  const paymentWhere: Prisma.PaymentWhereInput = {
    OR: [{ studentId: { in: studentIds } }, { application: { is: { contactEmail: eq } } }],
  };
  return {
    eq,
    user,
    guardians,
    children: [...children.values()],
    studentIds,
    applicationWhere,
    paymentWhere,
  };
}

const request = async (id: string) => {
  const r = await db.dataRequest.findUnique({ where: { id } });
  if (!r) throw new ApiError(404, "NOT_FOUND", "No such request.");
  return r;
};

export type DeletionPreview = {
  erase: (PolicyItem & { count: number })[];
  retain: (PolicyItem & { count: number })[];
};

/** Counts behind the erase-versus-retain checklist. Read-only: nothing is changed. */
export async function deletionPreview(actor: Actor, id: string): Promise<DeletionPreview> {
  assertCan(actor.role, "privacy:manage");
  const r = await request(id);
  const f = await subjectFacts(r.subjectEmail);
  const [leads, newsletter, drafts, submitted, invoices, payments, auditEntries] = await Promise.all([
    db.lead.count({ where: { email: f.eq } }),
    db.newsletterSubscriber.count({ where: { email: f.eq } }),
    db.application.count({ where: { AND: [f.applicationWhere, { stage: "DRAFT" }] } }),
    db.application.count({ where: { AND: [f.applicationWhere, { stage: { not: "DRAFT" } }] } }),
    db.invoice.count({ where: { studentId: { in: f.studentIds } } }),
    db.payment.count({ where: f.paymentWhere }),
    f.user ? db.auditLog.count({ where: { actorId: f.user.id } }) : Promise.resolve(0),
  ]);
  const counts: Record<PolicyKey, number> = {
    account: f.user ? 1 : 0,
    guardianContact: f.guardians.length,
    enquiries: leads,
    newsletter,
    draftApplications: drafts,
    invoices,
    payments,
    pupilRecord: f.studentIds.length,
    applications: submitted,
    auditLog: auditEntries,
  };
  const withCount = (items: PolicyItem[]) => items.map((i) => ({ ...i, count: counts[i.key] }));
  return { erase: withCount(DELETION_POLICY.erase), retain: withCount(DELETION_POLICY.retain) };
}

const LIST_CAP = 500;

/** The JSON bundle for an EXPORT request. Medical records, internal staff notes and credentials are left out. */
export async function dataBundle(actor: Actor, id: string) {
  assertCan(actor.role, "privacy:manage");
  const r = await request(id);
  if (r.kind !== "EXPORT")
    throw new ApiError(422, "NOT_AN_EXPORT", "Data bundles are prepared for export requests only.");
  const f = await subjectFacts(r.subjectEmail);
  const guardianIds = f.guardians.map((g) => g.id);
  const phones = [...new Set(f.guardians.flatMap((g) => phoneKeys(g.phone)))];

  const [
    applications,
    leads,
    newsletter,
    staffApplications,
    portalRequests,
    dataRequests,
    invoices,
    payments,
    messages,
  ] = await Promise.all([
    db.application.findMany({
      where: f.applicationWhere,
      include: { class: { select: { name: true } }, startYear: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.lead.findMany({ where: { email: f.eq }, orderBy: { createdAt: "desc" }, take: LIST_CAP }),
    db.newsletterSubscriber.findFirst({ where: { email: f.eq } }),
    db.staffApplication.findMany({
      where: { email: f.eq },
      include: { vacancy: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.portalRequest.findMany({
      where: { guardianId: { in: guardianIds } },
      include: { student: { select: { firstName: true, lastName: true, admissionNo: true } } },
      orderBy: { createdAt: "desc" },
      take: LIST_CAP,
    }),
    db.dataRequest.findMany({ where: { subjectEmail: f.eq }, orderBy: { createdAt: "desc" } }),
    db.invoice.findMany({
      where: { studentId: { in: f.studentIds } },
      include: { student: { select: { admissionNo: true } }, year: { select: { name: true } } },
      orderBy: { issuedAt: "desc" },
      take: LIST_CAP,
    }),
    db.payment.findMany({
      where: f.paymentWhere,
      include: { receipt: { select: { number: true } } },
      orderBy: { receivedAt: "desc" },
      take: LIST_CAP,
    }),
    db.outbox.findMany({
      where: { OR: [{ to: f.eq }, ...(phones.length ? [{ to: { in: phones } }] : [])] },
      select: { channel: true, template: true, subject: true, status: true, createdAt: true, sentAt: true },
      orderBy: { createdAt: "desc" },
      take: LIST_CAP,
    }),
  ]);

  const sum = <T>(rows: T[], pick: (row: T) => number) => rows.reduce((a, row) => a + pick(row), 0);

  const bundle = {
    bundleVersion: 1,
    generatedAt: new Date().toISOString(),
    request: { id: r.id, kind: r.kind, requestedAt: r.createdAt.toISOString() },
    subjectEmail: r.subjectEmail,
    currency: "INR",
    amountsAre: "integer paise (100 paise = 1 rupee)",
    account: f.user
      ? {
          email: f.user.email,
          name: f.user.name,
          role: f.user.role,
          active: f.user.active,
          createdAt: f.user.createdAt.toISOString(),
          lastSignIn: f.user.lastLoginAt?.toISOString() ?? null,
        }
      : null,
    guardianRecords: f.guardians.map((g) => ({
      name: g.name,
      email: g.email,
      phone: g.phone,
      occupation: g.occupation,
      address: g.address,
      createdAt: g.createdAt.toISOString(),
    })),
    children: f.children.map((link) => ({
      admissionNo: link.student.admissionNo,
      firstName: link.student.firstName,
      lastName: link.student.lastName,
      dateOfBirth: day(link.student.dob),
      class: link.student.class.name,
      section: link.student.section?.name ?? null,
      boarding: link.student.boardingType,
      status: link.student.status,
      relation: link.relation,
      primaryContact: link.isPrimary,
    })),
    consent: {
      guardians: f.guardians.map((g) => ({
        name: g.name,
        email: g.emailOptIn,
        whatsapp: g.whatsappOptIn,
        sms: g.smsOptIn,
      })),
      enquiries: leads.map((l) => ({
        enquiredOn: l.createdAt.toISOString(),
        consented: l.consent,
        consentedAt: l.consentAt?.toISOString() ?? null,
      })),
      newsletter: newsletter ? { subscribedSince: newsletter.consentAt.toISOString() } : null,
    },
    enquiries: leads.map((l) => ({
      createdAt: l.createdAt.toISOString(),
      source: l.source,
      status: l.status,
      parentName: l.parentName,
      phone: l.phone,
      email: l.email,
      childName: l.childName,
      classApplying: l.classApplying,
      preferredBoarding: l.preferredBoarding,
      message: l.message,
    })),
    admissionsApplications: applications.map((a) => ({
      ref: a.ref,
      stage: a.stage,
      createdAt: a.createdAt.toISOString(),
      child: {
        firstName: a.childFirstName,
        lastName: a.childLastName,
        dateOfBirth: day(a.dob),
        gender: a.gender,
        currentSchool: a.currentSchool,
      },
      classApplying: a.class.name,
      startYear: a.startYear.name,
      boarding: a.boardingType,
      contactEmail: a.contactEmail,
      contactPhone: a.contactPhone,
      guardians: a.guardians,
      registrationPaidAt: a.registrationPaidAt?.toISOString() ?? null,
      offerIssuedAt: a.offerIssuedAt?.toISOString() ?? null,
      decisionAt: a.decisionAt?.toISOString() ?? null,
    })),
    staffApplications: staffApplications.map((a) => ({
      ref: a.ref,
      status: a.status,
      vacancy: a.vacancy?.title ?? null,
      submittedAt: a.submittedAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
      fullName: a.fullName,
      data: a.data,
    })),
    fees: {
      invoices: {
        count: invoices.length,
        totalPaise: sum(invoices, (i) => i.totalPaise),
        paidPaise: sum(invoices, (i) => i.paidPaise),
        items: invoices.map((i) => ({
          number: i.number,
          admissionNo: i.student.admissionNo,
          year: i.year.name,
          status: i.status,
          totalPaise: i.totalPaise,
          paidPaise: i.paidPaise,
          lateFeePaise: i.lateFeePaise,
          issuedAt: i.issuedAt.toISOString(),
        })),
      },
      payments: {
        count: payments.length,
        receivedPaise: sum(payments, (p) => p.amountPaise),
        refundedPaise: sum(payments, (p) => p.refundedPaise),
        items: payments.map((p) => ({
          receiptNumber: p.receipt?.number ?? null,
          method: p.method,
          status: p.status,
          amountPaise: p.amountPaise,
          refundedPaise: p.refundedPaise,
          reference: p.reference,
          receivedAt: p.receivedAt.toISOString(),
        })),
      },
    },
    portalRequests: portalRequests.map((p) => ({
      kind: p.kind,
      status: p.status,
      child: `${p.student.firstName} ${p.student.lastName} (${p.student.admissionNo})`,
      details: p.payload,
      response: p.response,
      createdAt: p.createdAt.toISOString(),
    })),
    privacyRequests: dataRequests.map((d) => ({
      kind: d.kind,
      status: d.status,
      notes: d.notes,
      createdAt: d.createdAt.toISOString(),
    })),
    messagesSent: messages.map((m) => ({
      channel: m.channel,
      template: m.template,
      subject: m.subject,
      status: m.status,
      createdAt: m.createdAt.toISOString(),
    })),
    notIncluded: [
      "Medical records, which the Registrar releases separately on request",
      "Internal staff notes, scorecards and assessment comments",
      "Passwords, sign-in tokens and other credentials",
    ],
  };

  await audit({
    actor,
    action: "privacy.bundle",
    entity: "DataRequest",
    entityId: id,
    after: {
      children: bundle.children.length,
      applications: bundle.admissionsApplications.length,
      invoices: invoices.length,
      payments: payments.length,
      messages: messages.length,
    },
    reason: "Data bundle prepared for an export request",
  });
  return { bundle, filename: `data-bundle-${r.id}.json` };
}

export async function getDataRequest(actor: Actor, id: string) {
  assertCan(actor.role, "privacy:manage");
  const r = await request(id);
  const names = await handlerNames([r.handledById]);
  return { ...r, handledBy: r.handledById ? (names.get(r.handledById) ?? null) : null };
}
