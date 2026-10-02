import { ratioBp } from "./table";

export type SourceCounts = { enquiries: number; tours: number; applied: number; admitted: number };
export type SourceRow = SourceCounts & {
  key: string;
  enquiryToApplicationBp: number | null;
  enquiryToAdmissionBp: number | null;
};

type Layer = { key: string; count: number }[];

/**
 * Joins per-group counts, in the order enquiries, tours booked, applications, admitted, into one row per group. A group absent
 * from a later layer simply has none at that step. Rows come back biggest first, ties by name.
 */
export function mergeSourceCounts(layers: Layer[]): SourceRow[] {
  const rows = new Map<string, SourceCounts>();
  const names = ["enquiries", "tours", "applied", "admitted"] as const;
  layers.forEach((layer, i) => {
    for (const { key, count } of layer) {
      const row = rows.get(key) ?? { enquiries: 0, tours: 0, applied: 0, admitted: 0 };
      row[names[i]!] = count;
      rows.set(key, row);
    }
  });
  return [...rows.entries()]
    .map(([key, c]) => ({
      key,
      ...c,
      enquiryToApplicationBp: ratioBp(c.applied, c.enquiries),
      enquiryToAdmissionBp: ratioBp(c.admitted, c.enquiries),
    }))
    .sort((a, b) => b.enquiries - a.enquiries || a.key.localeCompare(b.key));
}

export const NO_VALUE = "(none)";

/** A group key built from one or more attributes (UTM source + campaign); missing values read "(none)". */
export const groupKey = (...parts: (string | null)[]): string =>
  JSON.stringify(parts.map((p) => p ?? NO_VALUE));
export const parseGroupKey = (key: string): string[] => JSON.parse(key) as string[];
