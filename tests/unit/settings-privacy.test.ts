import { describe, expect, it } from "vitest";
import {
  DELETION_POLICY,
  RETENTION_YEARS,
  appendHandlerNote,
  phoneKeys,
  resolveRequestSchema,
} from "@/lib/services/privacy-rules";

describe("resolveRequestSchema", () => {
  it("closes a request as done or rejected, with notes", () => {
    expect(resolveRequestSchema.parse({ status: "DONE", notes: " Export sent to the parent " })).toEqual({
      status: "DONE",
      notes: "Export sent to the parent",
    });
    expect(
      resolveRequestSchema.safeParse({ status: "REJECTED", notes: "Identity not verified" }).success,
    ).toBe(true);
  });

  it("will not reopen a request or accept an empty outcome", () => {
    expect(resolveRequestSchema.safeParse({ status: "OPEN", notes: "reopen please" }).success).toBe(false);
    expect(resolveRequestSchema.safeParse({ status: "DONE", notes: "ok" }).success).toBe(false);
    expect(resolveRequestSchema.safeParse({ status: "DONE" }).success).toBe(false);
  });
});

describe("appendHandlerNote", () => {
  it("keeps the person's own words and adds who handled it", () => {
    const out = appendHandlerNote("Please send me a copy", "Asha Rao", "DONE", "Bundle emailed");
    expect(out).toBe("Please send me a copy\n\n[Done by Asha Rao] Bundle emailed");
  });

  it("starts the history when there were no notes", () => {
    expect(appendHandlerNote(null, "Asha", "REJECTED", "Not the account holder")).toBe(
      "[Rejected by Asha] Not the account holder",
    );
    expect(appendHandlerNote("   ", "Asha", "DONE", "Erased by hand")).toBe("[Done by Asha] Erased by hand");
  });

  it("keeps the most recent text when the history gets long", () => {
    const out = appendHandlerNote("old ".repeat(1000), "Asha", "DONE", "the latest outcome");
    expect(out.length).toBe(2000);
    expect(out.endsWith("[Done by Asha] the latest outcome")).toBe(true);
  });
});

describe("phoneKeys", () => {
  it("matches a number as typed and with the country code in front", () => {
    expect(phoneKeys("98765 43210")).toEqual(["9876543210", "919876543210"]);
    expect(phoneKeys("+91 98765 43210")).toEqual(["919876543210"]);
    expect(phoneKeys("")).toEqual([]);
    expect(phoneKeys("n/a")).toEqual([]);
  });
});

describe("deletion policy", () => {
  const all = [...DELETION_POLICY.erase, ...DELETION_POLICY.retain];

  it("lists every item once, as either erased or retained", () => {
    const keys = all.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(DELETION_POLICY.erase.length).toBeGreaterThan(0);
    expect(DELETION_POLICY.retain.length).toBeGreaterThan(0);
  });

  it("retains fee records for eight years", () => {
    expect(RETENTION_YEARS).toBe(8);
    const retained = DELETION_POLICY.retain.map((i) => i.key);
    expect(retained).toEqual(expect.arrayContaining(["invoices", "payments"]));
    for (const key of ["invoices", "payments"])
      expect(DELETION_POLICY.retain.find((i) => i.key === key)!.detail).toContain("8 years");
  });

  it("never offers to erase money records or the audit trail", () => {
    const erased = DELETION_POLICY.erase.map((i) => i.key);
    for (const key of ["invoices", "payments", "auditLog", "pupilRecord"]) expect(erased).not.toContain(key);
  });
});
