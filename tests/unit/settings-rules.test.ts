import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS, STAFF_ROLES } from "@/lib/rbac";
import {
  activeChangeBlocker,
  formatDuration,
  inviteSchema,
  mergeSchoolProfile,
  moduleOf,
  reasonSchema,
  roleChangeBlocker,
  roleMatrix,
  schoolProfileSchema,
  scrubSecrets,
  summariseResult,
  type SchoolProfile,
} from "@/lib/services/settings-rules";

const profileInput = {
  name: "Aurelia Hall School",
  shortName: "Aurelia Hall",
  tagline: "Curious minds.",
  addressLines: ["1 Placeholder Ridge Road", "Kesarbagh 000 000"],
  phone: "+91 00000 00000",
  email: "Hello@Aurelia-Sample.test",
  admissionsEmail: "admissions@aurelia-sample.test",
  website: "https://aurelia-sample.test",
  whatsapp: "+91 00000-00000",
  social: { instagram: "https://example.com/a", linkedin: "", youtube: "" },
  registrationFeePaise: 1_000_000,
};

const defaults: SchoolProfile = schoolProfileSchema.parse(profileInput);

describe("school profile schema", () => {
  it("normalises what it accepts", () => {
    const p = schoolProfileSchema.parse({
      ...profileInput,
      addressLines: ["  Line one ", "", "   ", "Line two"],
    });
    expect(p.addressLines).toEqual(["Line one", "Line two"]);
    expect(p.email).toBe("hello@aurelia-sample.test");
    expect(p.whatsapp).toBe("910000000000");
  });

  it("rejects what would break the public pages", () => {
    const bad = (patch: object) => schoolProfileSchema.safeParse({ ...profileInput, ...patch }).success;
    expect(bad({ addressLines: ["", " "] })).toBe(false);
    expect(bad({ addressLines: Array.from({ length: 7 }, (_, i) => `Line ${i}`) })).toBe(false);
    expect(bad({ website: "aurelia-sample.test" })).toBe(false);
    expect(bad({ website: "javascript:alert(1)" })).toBe(false);
    expect(bad({ social: { instagram: "not a link", linkedin: "", youtube: "" } })).toBe(false);
    expect(bad({ whatsapp: "12345" })).toBe(false);
    expect(bad({ phone: "call us" })).toBe(false);
    expect(bad({ email: "nope" })).toBe(false);
    expect(bad({ name: " " })).toBe(false);
  });

  it("keeps the registration fee as whole paise within a sane range", () => {
    const bad = (registrationFeePaise: number) =>
      schoolProfileSchema.safeParse({ ...profileInput, registrationFeePaise }).success;
    expect(bad(0)).toBe(true);
    expect(bad(1_000_000)).toBe(true);
    expect(bad(1000.5)).toBe(false);
    expect(bad(-1)).toBe(false);
    expect(bad(10_000_001)).toBe(false);
  });
});

describe("mergeSchoolProfile", () => {
  it("returns the defaults when nothing is saved or the row is not an object", () => {
    expect(mergeSchoolProfile(defaults, null)).toEqual(defaults);
    expect(mergeSchoolProfile(defaults, "oops")).toEqual(defaults);
    expect(mergeSchoolProfile(defaults, [1, 2])).toEqual(defaults);
  });

  it("overlays valid saved fields on the defaults", () => {
    const merged = mergeSchoolProfile(defaults, { tagline: "A new line", registrationFeePaise: 500_000 });
    expect(merged.tagline).toBe("A new line");
    expect(merged.registrationFeePaise).toBe(500_000);
    expect(merged.name).toBe(defaults.name);
  });

  it("drops one invalid field without discarding the rest", () => {
    const merged = mergeSchoolProfile(defaults, { email: "broken", tagline: "Still applies" });
    expect(merged.email).toBe(defaults.email);
    expect(merged.tagline).toBe("Still applies");
  });

  it("merges social links one by one and never mutates the defaults", () => {
    const merged = mergeSchoolProfile(defaults, { social: { linkedin: "https://example.com/l" } });
    expect(merged.social).toEqual({
      instagram: "https://example.com/a",
      linkedin: "https://example.com/l",
      youtube: "",
    });
    expect(defaults.social.linkedin).toBe("");
    merged.social.youtube = "https://example.com/y";
    expect(defaults.social.youtube).toBe("");
  });
});

describe("invite and reason schemas", () => {
  it("only invites staff roles, with a lower-cased email", () => {
    const ok = inviteSchema.parse({ email: "New.Person@Example.com", name: "New Person", role: "REGISTRAR" });
    expect(ok.email).toBe("new.person@example.com");
    expect(inviteSchema.safeParse({ email: "a@b.co", name: "Ab", role: "PARENT" }).success).toBe(false);
    expect(inviteSchema.safeParse({ email: "a@b.co", name: "Ab", role: "APPLICANT" }).success).toBe(false);
    expect(inviteSchema.safeParse({ email: "x", name: "Ab", role: "HR" }).success).toBe(false);
  });

  it("wants a few words of reason", () => {
    expect(reasonSchema.safeParse("ok").success).toBe(false);
    expect(reasonSchema.safeParse("   hi   ").success).toBe(false);
    expect(reasonSchema.parse("  Covering the front office  ")).toBe("Covering the front office");
  });
});

describe("role change guards", () => {
  const target = { id: "u2", role: "TEACHER" as const, active: true };
  const base = { actorId: "u1", target, newRole: "REGISTRAR" as const, otherActiveSuperAdmins: 1 };

  it("allows an ordinary change", () => {
    expect(roleChangeBlocker(base)).toBeNull();
  });

  it("refuses to change your own role", () => {
    expect(roleChangeBlocker({ ...base, actorId: "u2" })).toMatch(/own role/);
  });

  it("refuses non-staff accounts and non-staff roles", () => {
    expect(roleChangeBlocker({ ...base, target: { ...target, role: "PARENT" } })).toMatch(/staff accounts/);
    expect(roleChangeBlocker({ ...base, newRole: "PARENT" })).toMatch(/staff role/);
  });

  it("refuses a no-op", () => {
    expect(roleChangeBlocker({ ...base, newRole: "TEACHER" })).toMatch(/already/);
  });

  it("never removes the last active super admin", () => {
    const sa = { id: "u2", role: "SUPER_ADMIN" as const, active: true };
    expect(roleChangeBlocker({ ...base, target: sa, otherActiveSuperAdmins: 0 })).toMatch(/at least one/);
    expect(roleChangeBlocker({ ...base, target: sa, otherActiveSuperAdmins: 1 })).toBeNull();
    // a super admin who is already switched off doesn't count towards the minimum
    expect(
      roleChangeBlocker({ ...base, target: { ...sa, active: false }, otherActiveSuperAdmins: 0 }),
    ).toBeNull();
  });
});

describe("access change guards", () => {
  const target = { id: "u2", role: "TEACHER" as const, active: true };
  const base = { actorId: "u1", target, active: false, otherActiveSuperAdmins: 1 };

  it("allows switching someone off and back on", () => {
    expect(activeChangeBlocker(base)).toBeNull();
    expect(activeChangeBlocker({ ...base, target: { ...target, active: false }, active: true })).toBeNull();
  });

  it("refuses yourself, non-staff and no-ops", () => {
    expect(activeChangeBlocker({ ...base, actorId: "u2" })).toMatch(/own access/);
    expect(activeChangeBlocker({ ...base, target: { ...target, role: "PARENT" } })).toMatch(/staff accounts/);
    expect(activeChangeBlocker({ ...base, active: true })).toMatch(/already active/);
    expect(activeChangeBlocker({ ...base, target: { ...target, active: false } })).toMatch(/already off/);
  });

  it("never switches off the last active super admin", () => {
    const sa = { id: "u2", role: "SUPER_ADMIN" as const, active: true };
    expect(activeChangeBlocker({ ...base, target: sa, otherActiveSuperAdmins: 0 })).toMatch(/at least one/);
    expect(activeChangeBlocker({ ...base, target: sa, otherActiveSuperAdmins: 2 })).toBeNull();
  });
});

describe("role matrix", () => {
  const { roles, modules } = roleMatrix();
  const rows = modules.flatMap((m) => m.rows);

  it("lists every staff permission exactly once and none for portal users", () => {
    const names = rows.map((r) => r.permission);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(PERMISSIONS.filter((p) => p !== "portal:access" && p !== "applicant:access"));
    expect(roles).toEqual(STAFF_ROLES);
  });

  it("mirrors ROLE_PERMISSIONS cell by cell", () => {
    for (const row of rows)
      for (const role of STAFF_ROLES)
        expect(row.roles[role], `${role} ${row.permission}`).toBe(
          ROLE_PERMISSIONS[role].includes(row.permission),
        );
  });

  it("groups by module and flags sensitive permissions", () => {
    const fees = modules.find((m) => m.module === "Fees")!;
    expect(fees.rows.map((r) => r.permission)).toContain("fees:revise");
    expect(fees.rows.map((r) => r.permission)).toContain("concessions:approve");
    const settings = modules.find((m) => m.module === "Settings")!;
    expect(settings.rows.find((r) => r.permission === "users:manage")?.sensitive).toBe(true);
    expect(settings.rows.find((r) => r.permission === "settings:read")?.sensitive).toBe(false);
    expect(modules.some((m) => m.module === "Other")).toBe(false);
  });

  it("gives every permission a module", () => {
    for (const p of PERMISSIONS.filter((x) => x !== "portal:access" && x !== "applicant:access"))
      expect(moduleOf(p), p).not.toBe("Other");
  });

  it("keeps users:manage to the super admin", () => {
    const row = rows.find((r) => r.permission === "users:manage")!;
    expect(STAFF_ROLES.filter((r) => row.roles[r])).toEqual(["SUPER_ADMIN"]);
  });
});

describe("scrubSecrets", () => {
  const env = {
    SMTP_PASS: "hunter2-hunter2",
    RAZORPAY_KEY_SECRET: "rzp_secret_value_123",
    DATABASE_URL: "postgresql://app:dbpassword@db.internal:5432/aurelia",
    NEXT_PUBLIC_SITE_URL: "https://aurelia-sample.test",
    EMAIL_PROVIDER: "resend",
    SMTP_PORT: "587",
    AUTH_TRUST_HOST: "true",
  };

  it("removes the values of secret-looking variables wherever they appear", () => {
    const out = scrubSecrets("535 bad login hunter2-hunter2 for rzp_secret_value_123", env);
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain("rzp_secret_value_123");
    expect(out).toContain("[redacted]");
  });

  it("removes credentials from URLs and bearer tokens", () => {
    expect(scrubSecrets("connect postgres://user:pa55@host:5432/db failed", {})).toBe(
      "connect postgres://[redacted]@host:5432/db failed",
    );
    expect(scrubSecrets("401 for Bearer abcdef0123456789xyz", {})).toBe("401 for Bearer [redacted]");
  });

  it("leaves harmless values and public variables alone", () => {
    const text = "Using resend on port 587 at https://aurelia-sample.test, trust true";
    expect(scrubSecrets(text, env)).toBe(text);
  });

  it("caps the length", () => {
    const out = scrubSecrets("x".repeat(500), {}, 50);
    expect(out).toHaveLength(50);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("display helpers", () => {
  it("formats durations", () => {
    expect(formatDuration(0)).toBe("0 ms");
    expect(formatDuration(412.4)).toBe("412 ms");
    expect(formatDuration(1500)).toBe("1.5 s");
    expect(formatDuration(-5)).toBe("0 ms");
  });

  it("summarises a job result on one line", () => {
    expect(summariseResult(null)).toBe("—");
    expect(summariseResult({ retried: 2, skipped: 0 })).toBe("retried: 2, skipped: 0");
    expect(summariseResult({ error: "boom" })).toBe("Error: boom");
    expect(summariseResult({ rows: { a: 1 } })).toBe('rows: {"a":1}');
    expect(summariseResult("done")).toBe('"done"');
    expect(summariseResult({ text: "y".repeat(300) }, 40)).toHaveLength(40);
  });
});
