import "server-only";

/** Cursor pagination over any Prisma delegate, stable for non-unique sort keys (tie-break on id). */
export type ListParams = { sort: string; dir: "asc" | "desc"; after?: string; before?: string; take: number };

export function parseListParams(
  sp: Record<string, string | string[] | undefined>,
  opts: { sorts: string[]; defaultSort: string; defaultDir?: "asc" | "desc"; take?: number },
): ListParams {
  const get = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) as string | undefined;
  const sort = opts.sorts.includes(get("sort") ?? "") ? get("sort")! : opts.defaultSort;
  const dir =
    get("dir") === "asc" || get("dir") === "desc"
      ? (get("dir") as "asc" | "desc")
      : (opts.defaultDir ?? "desc");
  const take = Math.min(Math.max(Number(get("size") ?? opts.take ?? 25) || 25, 5), 200);
  return { sort, dir, after: get("after") || undefined, before: get("before") || undefined, take };
}

type Delegate<T> = { findMany: (args: object) => Promise<T[]>; count: (args: object) => Promise<number> };

export async function cursorList<T extends { id: string }>(
  delegate: Delegate<T> | { findMany: (args: never) => unknown; count: (args: never) => unknown },
  args: { where: object; include?: object; select?: object },
  p: ListParams,
): Promise<{ rows: T[]; next: string | null; prev: string | null; total: number }> {
  const flip = (d: "asc" | "desc") => (d === "asc" ? "desc" : "asc");
  const sortPath = p.sort.split(".");
  const orderFor = (d: "asc" | "desc") => [
    sortPath.reduceRight<object>((acc, key) => ({ [key]: acc }), d as unknown as object),
    { id: d },
  ];
  const base = {
    where: args.where,
    ...(args.include ? { include: args.include } : {}),
    ...(args.select ? { select: args.select } : {}),
  };
  const d = delegate as Delegate<T>;
  const [found, total] = await Promise.all([
    p.before
      ? d.findMany({
          ...base,
          orderBy: orderFor(flip(p.dir)),
          cursor: { id: p.before },
          skip: 1,
          take: p.take + 1,
        })
      : d.findMany({
          ...base,
          orderBy: orderFor(p.dir),
          ...(p.after ? { cursor: { id: p.after }, skip: 1 } : {}),
          take: p.take + 1,
        }),
    d.count({ where: args.where }),
  ]);
  const more = found.length > p.take;
  let rows = more ? found.slice(0, p.take) : found;
  if (p.before) rows = rows.reverse();
  const next = p.before
    ? rows.length
      ? rows[rows.length - 1]!.id
      : null
    : more
      ? rows[rows.length - 1]!.id
      : null;
  const prev = p.before ? (more ? rows[0]!.id : null) : p.after ? (rows[0]?.id ?? null) : null;
  return { rows, next, prev, total };
}

export function asArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return (Array.isArray(v) ? v : v.split(",")).filter(Boolean);
}

export function dateRange(from?: string, to?: string) {
  const range: { gte?: Date; lte?: Date } = {};
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) range.gte = new Date(`${from}T00:00:00+05:30`);
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) range.lte = new Date(`${to}T23:59:59.999+05:30`);
  return Object.keys(range).length ? range : undefined;
}
