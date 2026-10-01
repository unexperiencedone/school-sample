import { describe, expect, it } from "vitest";
import {
  assertCan,
  can,
  ForbiddenError,
  isStaff,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  SENSITIVE,
} from "@/lib/rbac";

describe("rbac", () => {
  it("every role maps only to known permissions", () => {
    for (const perms of Object.values(ROLE_PERMISSIONS))
      for (const p of perms) expect(PERMISSIONS).toContain(p);
  });

  it("parents and applicants can't reach staff areas", () => {
    for (const role of ["PARENT", "APPLICANT"] as const) {
      expect(isStaff(role)).toBe(false);
      expect(can(role, "dashboard:view")).toBe(false);
      expect(can(role, "students:read")).toBe(false);
    }
    expect(can("PARENT", "portal:access")).toBe(true);
    expect(can("APPLICANT", "applicant:access")).toBe(true);
  });

  it("sensitive actions need elevated roles", () => {
    expect(can("TEACHER", "fees:revise")).toBe(false);
    expect(can("ADMISSIONS", "refunds:approve")).toBe(false);
    expect(can("ACCOUNTS", "refunds:request")).toBe(true);
    expect(can("ACCOUNTS", "refunds:approve")).toBe(false); // separation of duties
    expect(can("PRINCIPAL", "refunds:approve")).toBe(true);
    expect(can("ACCOUNTS", "concessions:approve")).toBe(false);
    expect(can("PRINCIPAL", "students:delete")).toBe(false);
    expect(can("SUPER_ADMIN", "students:delete")).toBe(true);
    for (const p of SENSITIVE) expect(can("TEACHER", p)).toBe(false);
  });

  it("medical data is field-restricted", () => {
    expect(can("TEACHER", "students:medical")).toBe(false);
    expect(can("HOUSEPARENT", "students:medical")).toBe(true);
    expect(can("ADMISSIONS", "students:medical")).toBe(false);
  });

  it("only super admin can reset the demo or manage users", () => {
    for (const role of Object.keys(ROLE_PERMISSIONS) as (keyof typeof ROLE_PERMISSIONS)[]) {
      expect(can(role, "demo:reset")).toBe(role === "SUPER_ADMIN");
      expect(can(role, "users:manage")).toBe(role === "SUPER_ADMIN");
    }
  });

  it("assertCan throws ForbiddenError; null role has no access", () => {
    expect(() => assertCan("TEACHER", "fees:revise")).toThrow(ForbiddenError);
    expect(() => assertCan("ACCOUNTS", "fees:revise")).not.toThrow();
    expect(can(null, "dashboard:view")).toBe(false);
  });
});
