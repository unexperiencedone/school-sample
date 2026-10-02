import { describe, expect, it } from "vitest";
import {
  CHANGE_LIMIT,
  REDACTED,
  VALUE_LIMIT,
  describeChanges,
  diffAudit,
  isRedactedKey,
  truncate,
} from "@/lib/services/audit-viewer-rules";

describe("isRedactedKey", () => {
  it("redacts keys that name secrets or health details", () => {
    for (const key of [
      "password",
      "passwordHash",
      "resumeTokenHash",
      "accessToken",
      "clientSecret",
      "aadhaarNumber",
      "AADHAAR",
      "medicalNotes",
      "allergies",
      "medications",
      "bloodGroup",
      "apiKey",
      "api_key",
    ])
      expect(isRedactedKey(key), key).toBe(true);
  });

  it("leaves ordinary keys alone", () => {
    for (const key of ["role", "status", "fields", "email", "amountPaise", "reason", "name"])
      expect(isRedactedKey(key), key).toBe(false);
  });
});

describe("diffAudit", () => {
  it("lists changed fields only, sorted by path", () => {
    const { changes, more } = diffAudit(
      { role: "TEACHER", active: true, name: "Asha" },
      { role: "REGISTRAR", active: true, name: "Asha" },
    );
    expect(changes).toEqual([{ path: "role", before: "TEACHER", after: "REGISTRAR", redacted: false }]);
    expect(more).toBe(0);
  });

  it("shows added and removed fields as an empty side", () => {
    const { changes } = diffAudit({ a: 1, gone: "x" }, { a: 1, fresh: "y" });
    expect(changes).toEqual([
      { path: "fresh", before: null, after: "y", redacted: false },
      { path: "gone", before: "x", after: null, redacted: false },
    ]);
  });

  it("treats a creation (after only) and a deletion (before only) as all fields", () => {
    expect(diffAudit(undefined, { email: "a@b.co", role: "HR" }).changes.map((c) => c.path)).toEqual([
      "email",
      "role",
    ]);
    expect(diffAudit({ email: "a@b.co" }, null).changes).toEqual([
      { path: "email", before: "a@b.co", after: null, redacted: false },
    ]);
    expect(diffAudit(undefined, undefined).changes).toEqual([]);
  });

  it("distinguishes a JSON null from a missing field", () => {
    const { changes } = diffAudit({ note: null }, {});
    expect(changes).toEqual([{ path: "note", before: "null", after: null, redacted: false }]);
  });

  it("walks nested objects with dotted paths and compares arrays whole", () => {
    const { changes } = diffAudit(
      { social: { youtube: "a", instagram: "same" }, lines: ["x", "y"] },
      { social: { youtube: "b", instagram: "same" }, lines: ["x", "z"] },
    );
    expect(changes.map((c) => [c.path, c.before, c.after])).toEqual([
      ["lines", '["x","y"]', '["x","z"]'],
      ["social.youtube", "a", "b"],
    ]);
  });

  it("never reveals a redacted value, but still shows that it changed", () => {
    const { changes } = diffAudit(
      {
        passwordHash: "argon2-old-hash",
        profile: { aadhaar: "1234 5678 9012" },
        medical: { allergies: "peanuts" },
      },
      {
        passwordHash: "argon2-new-hash",
        profile: { aadhaar: "9999 8888 7777" },
        medical: { allergies: "peanuts" },
      },
    );
    const json = JSON.stringify(changes);
    for (const secret of ["argon2", "1234", "9999", "peanuts"]) expect(json).not.toContain(secret);
    expect(changes.map((c) => c.path)).toEqual(["passwordHash", "profile.aadhaar"]);
    expect(changes.every((c) => c.redacted && c.before === REDACTED && c.after === REDACTED)).toBe(true);
  });

  it("redacts a whole subtree under a sensitive key, and unchanged secrets stay out of the list", () => {
    const { changes } = diffAudit({ token: { a: 1 }, ok: 1 }, { token: { a: 1 }, ok: 2 });
    expect(changes.map((c) => c.path)).toEqual(["ok"]);
  });

  it("truncates long values", () => {
    const long = "z".repeat(500);
    const { changes } = diffAudit({ body: "short" }, { body: long });
    expect(changes[0]!.after).toHaveLength(VALUE_LIMIT);
    expect(changes[0]!.after!.endsWith("…")).toBe(true);
    expect(truncate("abc", 10)).toBe("abc");
  });

  it("caps the number of rows and counts the rest", () => {
    const after = Object.fromEntries(
      Array.from({ length: CHANGE_LIMIT + 7 }, (_, i) => [`f${String(i).padStart(3, "0")}`, i]),
    );
    const { changes, more } = diffAudit({}, after);
    expect(changes).toHaveLength(CHANGE_LIMIT);
    expect(more).toBe(7);
  });

  it("copes with non-object roots", () => {
    expect(diffAudit("a", "b").changes).toEqual([
      { path: "value", before: "a", after: "b", redacted: false },
    ]);
  });
});

describe("describeChanges", () => {
  it("writes one line for the CSV", () => {
    const { changes } = diffAudit({ role: "TEACHER" }, { role: "HR", extra: 1 });
    expect(describeChanges(changes)).toBe("extra: — → 1; role: TEACHER → HR");
    expect(describeChanges(changes, 3)).toBe("extra: — → 1; role: TEACHER → HR; +3 more");
    expect(describeChanges([])).toBe("");
  });
});
