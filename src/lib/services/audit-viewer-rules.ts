/**
 * Pure helpers for the audit viewer: turn the before/after JSON of an AuditLog row into a short, readable list of
 * changed fields, with sensitive values redacted and long values truncated. Nothing here touches the database.
 */

export const REDACTED = "[redacted]";

/** Keys whose values are never shown, whatever they hold. Medical data is never stored in audit rows; this is a backstop. */
const REDACT_KEY =
  /(password|passwd|token|secret|aadhaar|aadhar|medical|allerg|medication|diagnos|blood|api[_-]?key|hash|salt)/i;

export function isRedactedKey(key: string): boolean {
  return REDACT_KEY.test(key);
}

export type Change = {
  path: string;
  /** null when the field did not exist on that side. */
  before: string | null;
  after: string | null;
  redacted: boolean;
};

export const VALUE_LIMIT = 120;
export const CHANGE_LIMIT = 40;

export function truncate(text: string, limit = VALUE_LIMIT): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

type Leaf = { text: string; redacted: boolean };

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function flatten(value: unknown, path: string, out: Map<string, Leaf>, redacted = false): void {
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0 && path) out.set(path, { text: "{}", redacted });
    for (const key of keys) {
      flatten(value[key], path ? `${path}.${key}` : key, out, redacted || isRedactedKey(key));
    }
    return;
  }
  // A null root is how an unset JSON column reads back: there is nothing on that side
  if (value === undefined || (value === null && !path)) return;
  out.set(path || "value", { text: typeof value === "string" ? value : JSON.stringify(value), redacted });
}

/** Changed fields only, sorted by path. Redacted fields appear (so a change is visible) but never with their values. */
export function diffAudit(before: unknown, after: unknown): { changes: Change[]; more: number } {
  const a = new Map<string, Leaf>();
  const b = new Map<string, Leaf>();
  flatten(before, "", a);
  flatten(after, "", b);
  const changes: Change[] = [];
  for (const path of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    const x = a.get(path);
    const y = b.get(path);
    if (x && y && x.text === y.text) continue;
    const redacted = !!(x?.redacted || y?.redacted);
    changes.push({
      path,
      before: x ? (redacted ? REDACTED : truncate(x.text)) : null,
      after: y ? (redacted ? REDACTED : truncate(y.text)) : null,
      redacted,
    });
  }
  return { changes: changes.slice(0, CHANGE_LIMIT), more: Math.max(0, changes.length - CHANGE_LIMIT) };
}

/** `field: old → new; …` for the CSV export. */
export function describeChanges(changes: Change[], more = 0): string {
  const text = changes.map((c) => `${c.path}: ${c.before ?? "—"} → ${c.after ?? "—"}`).join("; ");
  return more > 0 ? `${text}; +${more} more` : text;
}
