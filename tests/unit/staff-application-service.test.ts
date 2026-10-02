import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { validApplication } from "./staff-application.fixtures";

type Row = {
  id: string;
  ref: string;
  vacancyId: string | null;
  email: string;
  fullName: string | null;
  status: "DRAFT" | "RECEIVED";
  currentStep: number;
  data: Record<string, unknown>;
  resumeTokenHash: string | null;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** A tiny in-memory stand-in for the three tables the service touches. */
const store = vi.hoisted(() => ({
  rows: [] as Row[],
  vacancies: [] as {
    id: string;
    slug: string;
    title: string;
    department: string;
    employment: string;
    status: string;
    closesAt: Date;
  }[],
  sent: [] as { template: string; to: { email?: string | null }; data?: Record<string, unknown> }[],
  audits: [] as { action: string; entityId?: string | null }[],
}));

vi.mock("@/lib/db", () => {
  const withVacancy = (r: Row) => ({
    ...r,
    vacancy: store.vacancies.find((v) => v.id === r.vacancyId) ?? null,
  });
  const db = {
    staffApplication: {
      create: async ({ data }: { data: Partial<Row> }) => {
        const row = {
          id: `app${store.rows.length + 1}`,
          fullName: null,
          submittedAt: null,
          vacancyId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        } as Row;
        store.rows.push(row);
        return row;
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const r = store.rows.find((x) => x.id === where.id);
        return r ? withVacancy(r) : null;
      },
      updateMany: async ({ where, data }: { where: { id: string; status: string }; data: Partial<Row> }) => {
        const r = store.rows.find((x) => x.id === where.id && x.status === where.status);
        if (!r) return { count: 0 };
        Object.assign(r, data, { updatedAt: new Date() });
        return { count: 1 };
      },
    },
    vacancy: {
      findUnique: async ({ where }: { where: { slug: string } }) =>
        store.vacancies.find((v) => v.slug === where.slug) ?? null,
    },
    upload: { findMany: async () => [], count: async () => 0 },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return { db };
});
vi.mock("@/lib/notify", () => ({
  sendTemplate: async (o: (typeof store.sent)[number]) => {
    store.sent.push(o);
    return [];
  },
}));
vi.mock("@/lib/audit", () => ({
  audit: async (a: { action: string; entityId?: string | null }) => {
    store.audits.push(a);
  },
}));
vi.mock("@/lib/services/uploads", () => ({ createUpload: async () => ({}) }));
// `@/lib/api` pulls in Auth.js through the session helper, which Node-only Vitest cannot load.
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => null }));

const svc = await import("@/lib/services/staff-applications");

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error("expected an ApiError");
};

describe("resume tokens and references", () => {
  it("makes references of the form SA-<year>-<5 unambiguous symbols>", () => {
    const ref = svc.makeRef(new Date("2026-10-02T06:00:00Z"));
    expect(ref).toMatch(/^SA-2026-[A-HJ-NP-Z2-9]{5}$/);
    expect(svc.makeRef(new Date("2026-10-02T06:00:00Z"), Uint8Array.from([0, 1, 2, 31, 32]))).toBe(
      "SA-2026-ABC9A",
    );
  });

  it("uses the IST year around New Year", () => {
    expect(svc.makeRef(new Date("2026-12-31T19:00:00Z"))).toMatch(/^SA-2027-/);
  });

  it("issues long, url-safe, unique tokens and stores only their hash", () => {
    const a = svc.newResumeToken();
    const b = svc.newResumeToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(a).not.toBe(b);
    const hash = svc.hashResumeToken(a);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(a);
    expect(svc.tokenMatches(hash, a)).toBe(true);
    expect(svc.tokenMatches(hash, b)).toBe(false);
    expect(svc.tokenMatches(null, a)).toBe(false);
  });

  it("expires drafts after 14 days without a save", () => {
    const now = new Date("2026-10-20T00:00:00Z");
    expect(svc.isDraftExpired(new Date("2026-10-06T00:00:00Z"), now)).toBe(false);
    expect(svc.isDraftExpired(new Date("2026-10-05T23:59:00Z"), now)).toBe(true);
  });

  it("builds an absolute resume link", () => {
    const url = svc.resumeUrl("abc", "t o/k");
    expect(url).toMatch(/^https?:\/\/.+\/careers\/apply\?resume=t%20o%2Fk&id=abc$/);
  });
});

describe("saving, resuming and submitting", () => {
  beforeEach(() => {
    store.rows.length = 0;
    store.sent.length = 0;
    store.audits.length = 0;
    store.vacancies.length = 0;
    store.vacancies.push({
      id: "vac1",
      slug: "teacher-of-english",
      title: "Teacher of English",
      department: "English",
      employment: "Full-time",
      status: "OPEN",
      closesAt: new Date(Date.now() + 30 * 86_400_000),
    });
  });

  const app = validApplication();
  const create = (vacancySlug?: string) =>
    svc.createOrUpdateDraft({ step: 1, data: app.personal, vacancySlug });

  /** Saves steps 2 to 8 for an existing draft. */
  async function fillDraft(id: string, token: string) {
    const steps = [
      "family",
      "education",
      "current",
      "history",
      "interests",
      "statement",
      "references",
    ] as const;
    for (const [i, key] of steps.entries())
      await svc.createOrUpdateDraft({ id, token, step: i + 2, data: app[key] });
  }

  it("creates a draft, returns the token once, stores only its hash and emails the link", async () => {
    const res = await create("teacher-of-english");
    expect(res.resumeToken).toBeTruthy();
    expect(res.ref).toMatch(/^SA-\d{4}-/);
    const row = store.rows[0]!;
    expect(row.status).toBe("DRAFT");
    expect(row.vacancyId).toBe("vac1");
    expect(row.email).toBe("test.applicant@example.com");
    expect(row.resumeTokenHash).toBe(svc.hashResumeToken(res.resumeToken!));
    expect(JSON.stringify(row)).not.toContain(res.resumeToken!);
    expect(store.sent).toHaveLength(1);
    expect(store.sent[0]!.template).toBe("staff-application-resume");
    expect(String(store.sent[0]!.data?.url)).toContain(`resume=${res.resumeToken}`);
  });

  it("does not return a token on later saves", async () => {
    const first = await create();
    const later = await svc.createOrUpdateDraft({
      id: first.id,
      token: first.resumeToken,
      step: 2,
      data: app.family,
    });
    expect(later.resumeToken).toBeUndefined();
    expect(later.currentStep).toBe(3);
  });

  it("rejects a save with the wrong token, and does not reveal whether the id exists", async () => {
    const first = await create();
    const wrong = await failure(
      svc.createOrUpdateDraft({ id: first.id, token: "x".repeat(32), step: 2, data: app.family }),
    );
    const missing = await failure(
      svc.createOrUpdateDraft({ id: "nope", token: "x".repeat(32), step: 2, data: app.family }),
    );
    expect(wrong.status).toBe(403);
    expect(missing.status).toBe(403);
    expect(wrong.code).toBe(missing.code);
    expect((await failure(svc.createOrUpdateDraft({ id: first.id, step: 2, data: app.family }))).status).toBe(
      401,
    );
  });

  it("validates each step with the shared schemas and returns issues", async () => {
    const e = await failure(svc.createOrUpdateDraft({ step: 1, data: { ...app.personal, email: "nope" } }));
    expect(e.status).toBe(422);
    expect((e.details as { issues: { path: string }[] }).issues.map((i) => i.path)).toContain("email");
    expect(store.rows).toHaveLength(0);
  });

  it("only creates a draft from step 1", async () => {
    expect((await failure(svc.createOrUpdateDraft({ step: 2, data: app.family }))).code).toBe(
      "START_AT_STEP_ONE",
    );
  });

  it("refuses a closed or unknown vacancy for a new draft", async () => {
    store.vacancies[0]!.closesAt = new Date(Date.now() - 86_400_000);
    expect((await failure(create("teacher-of-english"))).code).toBe("VACANCY_CLOSED");
    expect((await failure(create("missing"))).code).toBe("UNKNOWN_VACANCY");
  });

  it("returns the draft to the holder of the token, and expires it after 14 days", async () => {
    const first = await create();
    const draft = await svc.getDraft(first.id, first.resumeToken);
    expect(draft.status).toBe("DRAFT");
    expect(draft.data.personal?.fullName).toBe("Test Applicant");
    store.rows[0]!.updatedAt = new Date(Date.now() - 15 * 86_400_000);
    expect((await failure(svc.getDraft(first.id, first.resumeToken))).status).toBe(410);
  });

  it("refuses to submit an incomplete application and names the first failing step", async () => {
    const first = await create();
    await svc.createOrUpdateDraft({ id: first.id, token: first.resumeToken, step: 2, data: app.family });
    const e = await failure(svc.submit({ id: first.id, token: first.resumeToken, data: app.declaration }));
    expect(e.status).toBe(422);
    expect(e.code).toBe("INCOMPLETE");
    const details = e.details as { firstStep: number; steps: Record<string, unknown> };
    expect(details.firstStep).toBe(3);
    expect(Object.keys(details.steps)).toContain("references");
    expect(store.rows[0]!.status).toBe("DRAFT");
  });

  it("submits a complete application once, audits it and emails the confirmation", async () => {
    const first = await create("teacher-of-english");
    await fillDraft(first.id, first.resumeToken!);
    const done = await svc.submit({ id: first.id, token: first.resumeToken, data: app.declaration });
    expect(done).toMatchObject({ ref: first.ref, name: "Test Applicant", role: "Teacher of English" });
    const row = store.rows[0]!;
    expect(row).toMatchObject({ status: "RECEIVED", fullName: "Test Applicant", currentStep: 9 });
    expect(row.submittedAt).toBeInstanceOf(Date);
    expect(store.audits.map((a) => a.action)).toEqual(["staff_application.submitted"]);
    const received = store.sent.find((s) => s.template === "staff-application-received");
    expect(received?.to.email).toBe("test.applicant@example.com");
    expect(received?.data).toMatchObject({
      name: "Test Applicant",
      role: "Teacher of English",
      ref: first.ref,
    });

    // read-only from now on
    expect(
      (await failure(svc.submit({ id: first.id, token: first.resumeToken, data: app.declaration }))).status,
    ).toBe(409);
    expect(
      (
        await failure(
          svc.createOrUpdateDraft({ id: first.id, token: first.resumeToken, step: 2, data: app.family }),
        )
      ).status,
    ).toBe(409);
    const view = await svc.getDraft(first.id, first.resumeToken);
    expect(view.status).toBe("RECEIVED");
    expect(view.data).toEqual({});
  });

  it("refuses a submission whose referees lack a current employer", async () => {
    const first = await create();
    await fillDraft(first.id, first.resumeToken!);
    const references = {
      items: app.references.items.map((r) => ({ ...r, isCurrentEmployer: false })),
    };
    store.rows[0]!.data.references = references;
    const e = await failure(svc.submit({ id: first.id, token: first.resumeToken, data: app.declaration }));
    expect((e.details as { firstStep: number }).firstStep).toBe(8);
  });
});
