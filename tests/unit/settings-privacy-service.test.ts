import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETION_POLICY } from "@/lib/services/privacy-rules";

type StaffRow = { email: string; status: "DRAFT" | "RECEIVED" | "REJECTED" };

const store = vi.hoisted(() => ({
  staff: [] as StaffRow[],
}));

/** A stand-in for the tables the checklist counts. Only the staff application table holds anything. */
vi.mock("@/lib/db", () => {
  const zero = { count: async () => 0 };
  return {
    db: {
      dataRequest: {
        findUnique: async () => ({ id: "req1", kind: "DELETION", subjectEmail: "Candidate@Example.com" }),
      },
      user: { findFirst: async () => null },
      guardian: { findMany: async () => [] },
      lead: zero,
      newsletterSubscriber: zero,
      application: zero,
      invoice: zero,
      payment: zero,
      auditLog: zero,
      staffApplication: {
        count: async ({
          where,
        }: {
          where: { email: { equals: string; mode: string }; status: "DRAFT" | { not: "DRAFT" } };
        }) =>
          store.staff.filter(
            (r) =>
              r.email.toLowerCase() === where.email.equals.toLowerCase() &&
              (where.status === "DRAFT" ? r.status === "DRAFT" : r.status !== "DRAFT"),
          ).length,
      },
    },
  };
});
vi.mock("@/lib/audit", () => ({ audit: async () => undefined }));
// `@/lib/api` pulls in Auth.js through the session helper, which Node-only Vitest cannot load.
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => null }));

const { deletionPreview } = await import("@/lib/services/privacy");

const admin = { id: "u1", role: "SUPER_ADMIN" as const };
const countOf = (items: { key: string; count: number }[], key: string) =>
  items.find((i) => i.key === key)?.count;

describe("deletion checklist and staff applications", () => {
  beforeEach(() => {
    store.staff.length = 0;
  });

  it("counts a candidate's drafts to erase and submitted applications to retain, by email in any case", async () => {
    store.staff.push(
      { email: "candidate@example.com", status: "DRAFT" },
      { email: "CANDIDATE@example.com", status: "DRAFT" },
      { email: "candidate@example.com", status: "RECEIVED" },
      { email: "candidate@example.com", status: "REJECTED" },
      { email: "someone.else@example.com", status: "DRAFT" },
      { email: "someone.else@example.com", status: "RECEIVED" },
    );
    const preview = await deletionPreview(admin, "req1");
    expect(countOf(preview.erase, "staffDrafts")).toBe(2);
    expect(countOf(preview.retain, "staffApplications")).toBe(2);
  });

  it("shows both lines with nothing held, and they are the policy's own items", async () => {
    const preview = await deletionPreview(admin, "req1");
    expect(preview.erase.map((i) => i.key)).toEqual(DELETION_POLICY.erase.map((i) => i.key));
    expect(preview.retain.map((i) => i.key)).toEqual(DELETION_POLICY.retain.map((i) => i.key));
    expect(countOf(preview.erase, "staffDrafts")).toBe(0);
    expect(countOf(preview.retain, "staffApplications")).toBe(0);
  });
});
