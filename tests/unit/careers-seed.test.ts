import { describe, expect, it } from "vitest";
import { buildStaffApplications } from "../../prisma/seed/careers";
import { SEED_TODAY } from "../../prisma/seed/finance";
import { createRng } from "../../prisma/seed/rng";
import { applicationGaps, safeguardingFlags, scorecardTotal } from "@/lib/services/careers-admin-rules";
import { applicantName, validateAll, wordCount } from "@/lib/schemas/staff-application";

const build = (seed = 20260401) => buildStaffApplications(createRng(seed));
const count = <T>(items: T[], pick: (t: T) => string) =>
  items.reduce<Record<string, number>>((m, t) => ({ ...m, [pick(t)]: (m[pick(t)] ?? 0) + 1 }), {});

describe("seeded staff applications", () => {
  const specs = build();

  it("builds exactly 20, none of them drafts", () => {
    expect(specs).toHaveLength(20);
    expect(specs.some((s) => s.status === "DRAFT")).toBe(false);
  });

  it("covers every pipeline stage in the requested proportions", () => {
    const by = count(specs, (s) => s.status);
    expect(by.RECEIVED).toBeGreaterThanOrEqual(3);
    expect(by.SHORTLISTED).toBeGreaterThanOrEqual(3);
    expect(by.INTERVIEW).toBeGreaterThanOrEqual(3);
    expect(by.OFFER).toBe(2);
    expect(by.HIRED).toBe(2);
    expect(by.REJECTED).toBe(3);
  });

  it("spreads across several vacancies but not all twelve", () => {
    const vacancies = new Set(specs.map((s) => s.vacancySlug));
    expect(vacancies.size).toBeGreaterThanOrEqual(6);
    expect(vacancies.size).toBeLessThan(12);
  });

  it("holds a complete, valid application in every one", () => {
    for (const s of specs) {
      const r = validateAll(s.data);
      expect(r.ok, `${s.ref}: ${JSON.stringify(Object.keys(r.errors))}`).toBe(true);
      expect(applicantName(s.data)).toBe(s.fullName);
      expect(s.data.personal?.email).toBe(s.email);
    }
  });

  it("writes statements of a believable length", () => {
    for (const s of specs) {
      const words = wordCount(s.data.statement!.text);
      expect(words).toBeGreaterThanOrEqual(150);
      expect(words).toBeLessThanOrEqual(400);
    }
  });

  it("gives every person a distinct name, email and reference in arrival order", () => {
    expect(new Set(specs.map((s) => s.fullName)).size).toBe(20);
    expect(new Set(specs.map((s) => s.email)).size).toBe(20);
    expect(specs.map((s) => s.ref)).toEqual(
      Array.from({ length: 20 }, (_, i) => `SA-2026-${String(i + 1).padStart(5, "0")}`),
    );
    const times = specs.map((s) => s.submittedAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("avoids names already used elsewhere in the seed", () => {
    const first = specs[0]!.fullName;
    const again = buildStaffApplications(createRng(20260401), new Set([first]));
    expect(again.some((s) => s.fullName === first)).toBe(false);
  });

  it("submits within the eight weeks before the seed date, never in the future", () => {
    const now = SEED_TODAY.getTime();
    for (const s of specs) {
      expect(s.submittedAt.getTime()).toBeLessThan(now);
      expect(s.submittedAt.getTime()).toBeGreaterThanOrEqual(now - 56 * 86400_000);
      expect(s.createdAt.getTime()).toBeLessThanOrEqual(s.submittedAt.getTime());
      expect(s.updatedAt.getTime()).toBeGreaterThanOrEqual(s.submittedAt.getTime());
      expect(s.updatedAt.getTime()).toBeLessThan(now);
      for (const n of s.notes) expect(n.createdAt.getTime()).toBeGreaterThan(s.submittedAt.getTime());
    }
  });

  it("scores everyone shortlisted or beyond, and the total matches the ratings", () => {
    for (const s of specs) {
      if (["SHORTLISTED", "INTERVIEW", "OFFER", "HIRED"].includes(s.status)) {
        expect(s.scorecard, s.ref).not.toBeNull();
        expect(s.score).toBe(scorecardTotal(s.scorecard!));
        expect(s.score).toBeGreaterThanOrEqual(5);
        expect(s.score).toBeLessThanOrEqual(25);
      }
      if (s.status === "RECEIVED") expect(s.score).toBeNull();
    }
  });

  it("includes two employment gaps and one declared pending action", () => {
    const withGaps = specs.filter((s) => applicationGaps(s.data, "2026-10").length > 0);
    expect(withGaps).toHaveLength(2);
    const flagged = specs.filter((s) => safeguardingFlags(s.data).length > 0);
    expect(flagged).toHaveLength(1);
    expect(safeguardingFlags(flagged[0]!.data).map((f) => f.key)).toEqual(["pendingAction"]);
    expect(flagged[0]!.data.declaration?.convictions).toBe("NONE");
  });

  it("has a few notes, and a reason on every note that records a rejection", () => {
    const notes = specs.flatMap((s) => s.notes.map((n) => ({ ...n, status: s.status })));
    expect(notes.length).toBeGreaterThanOrEqual(5);
    for (const n of notes.filter((x) => x.body.startsWith("Moved from"))) {
      expect(n.status).toBe("REJECTED");
      expect(n.body).toContain("Reason:");
    }
  });

  it("is deterministic for a given seed and differs for another", () => {
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
    expect(JSON.stringify(build(7))).not.toBe(JSON.stringify(build()));
  });

  it("uses placeholder contact details only", () => {
    for (const s of specs) {
      expect(s.email).toMatch(/@applicant-sample\.test$/);
      for (const r of s.data.references!.items) expect(r.email).toMatch(/@referee-sample\.test$/);
      expect(s.data.personal!.phone).toMatch(/^\+91 90000 \d{5}$/);
    }
  });
});
