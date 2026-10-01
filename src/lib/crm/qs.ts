/** Builds a query string from current search params with a patch (null removes a key). Resets pagination by default. */
export function qs(
  current: Record<string, string | string[] | undefined>,
  patch: Record<string, string | null | undefined>,
  keepPage = false,
): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    if (v === undefined) continue;
    if (!keepPage && (k === "after" || k === "before")) continue;
    p.set(k, Array.isArray(v) ? v.join(",") : v);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === "") p.delete(k);
    else p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}
