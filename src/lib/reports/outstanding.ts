import {
  AGEING_BUCKETS,
  ageingBucket,
  daysPastDue,
  outstandingParts,
  type AgeingKey,
  type OpenInstalment,
} from "./ageing";

export type OutstandingRow = OpenInstalment & {
  studentId: string;
  classId: string;
  className: string;
  classOrder: number;
  /** One id per family: the pupil's primary guardian (or the pupil, when none is on record). */
  familyKey: string;
  familyName: string;
};

type Money = { principal: number; lateFee: number; total: number };
const zero = (): Money => ({ principal: 0, lateFee: 0, total: 0 });
const add = (a: Money, b: Money) => {
  a.principal += b.principal;
  a.lateFee += b.lateFee;
  a.total += b.total;
};

export type BucketSummary = Money & { key: AgeingKey; label: string; instalments: number };
export type ClassSummary = Money & {
  classId: string;
  name: string;
  order: number;
  pupils: number;
  /** Outstanding (principal + late fee) in each ageing bucket. */
  byBucket: Record<AgeingKey, number>;
};
export type FamilySummary = Money & {
  key: string;
  name: string;
  pupils: number;
  instalments: number;
  /** The part of the balance already past its due date. */
  overdue: number;
  oldestDays: number;
};

export type OutstandingSummary = {
  total: Money;
  overdue: number;
  families: number;
  pupils: number;
  instalments: number;
  buckets: BucketSummary[];
  classes: ClassSummary[];
  topFamilies: FamilySummary[];
};

/** Ageing, per-class and per-family totals of unpaid instalments as at `today` (IST date, UTC midnight). */
export function summariseOutstanding(rows: OutstandingRow[], today: Date, topN = 15): OutstandingSummary {
  const buckets = new Map<AgeingKey, BucketSummary>(
    AGEING_BUCKETS.map((b) => [b.key, { ...zero(), key: b.key, label: b.label, instalments: 0 }]),
  );
  const classes = new Map<string, ClassSummary & { students: Set<string> }>();
  const families = new Map<string, FamilySummary & { students: Set<string> }>();
  const total = zero();
  const pupils = new Set<string>();
  let overdue = 0;
  let instalments = 0;

  for (const r of rows) {
    const parts = outstandingParts(r);
    if (parts.total <= 0) continue;
    const days = daysPastDue(r.dueDate, today);
    const bucketKey = ageingBucket(days);
    instalments++;
    add(total, parts);
    pupils.add(r.studentId);
    if (days > 0) overdue += parts.total;

    const bucket = buckets.get(bucketKey)!;
    bucket.instalments++;
    add(bucket, parts);

    const cls = classes.get(r.classId) ?? {
      ...zero(),
      classId: r.classId,
      name: r.className,
      order: r.classOrder,
      pupils: 0,
      byBucket: { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 },
      students: new Set<string>(),
    };
    add(cls, parts);
    cls.byBucket[bucketKey] += parts.total;
    cls.students.add(r.studentId);
    classes.set(r.classId, cls);

    const fam = families.get(r.familyKey) ?? {
      ...zero(),
      key: r.familyKey,
      name: r.familyName,
      pupils: 0,
      instalments: 0,
      overdue: 0,
      oldestDays: 0,
      students: new Set<string>(),
    };
    add(fam, parts);
    fam.instalments++;
    if (days > 0) {
      fam.overdue += parts.total;
      fam.oldestDays = Math.max(fam.oldestDays, days);
    }
    fam.students.add(r.studentId);
    families.set(r.familyKey, fam);
  }

  return {
    total,
    overdue,
    families: families.size,
    pupils: pupils.size,
    instalments,
    buckets: [...buckets.values()],
    classes: [...classes.values()]
      .map(({ students, ...c }) => ({ ...c, pupils: students.size }))
      .sort((a, b) => a.order - b.order),
    topFamilies: [...families.values()]
      .map(({ students, ...f }) => ({ ...f, pupils: students.size }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
      .slice(0, topN),
  };
}
