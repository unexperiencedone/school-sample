import { describe, expect, it } from "vitest";
import { shiftDays, shiftStatements } from "@/lib/demo/load-snapshot.mjs";

describe("moving the demo's dates to today", () => {
  const anchor = "2026-10-01"; // a Thursday

  it("moves nothing on the day it was made, or when the clock is earlier", () => {
    expect(shiftDays(anchor, new Date("2026-10-01T05:00:00Z"))).toBe(0);
    expect(shiftDays(anchor, new Date("2026-09-01T05:00:00Z"))).toBe(0);
  });

  it("moves in whole weeks so every date keeps its weekday", () => {
    for (const day of [3, 7, 8, 30, 100, 400]) {
      const now = new Date(Date.parse(`${anchor}T06:00:00Z`) + day * 86400e3);
      const days = shiftDays(anchor, now);
      expect(days % 7).toBe(0);
      expect(days).toBeLessThanOrEqual(day);
      expect(day - days).toBeLessThan(7); // today is never more than a week ahead of the data
    }
  });

  it("counts the day in IST, not UTC", () => {
    // 19:00 UTC on 7 Oct is already 8 Oct in India, which is seven days in: one whole week
    expect(shiftDays(anchor, new Date("2026-10-06T19:00:00Z"))).toBe(0);
    expect(shiftDays(anchor, new Date("2026-10-07T19:00:00Z"))).toBe(7);
  });

  it("shifts dates and timestamps but never birth dates, and skips transient tables", () => {
    const sql = shiftStatements(
      [
        { table_name: "Student", column_name: "dob", data_type: "date" },
        { table_name: "Student", column_name: "admittedOn", data_type: "date" },
        { table_name: "Student", column_name: "createdAt", data_type: "timestamp without time zone" },
        { table_name: "Lead", column_name: "childDob", data_type: "date" },
        { table_name: "Session", column_name: "expires", data_type: "timestamp without time zone" },
        { table_name: "Instalment", column_name: "dueDate", data_type: "date" },
      ],
      14,
    );
    expect(sql).toEqual([
      `update "Student" set "admittedOn" = "admittedOn" + 14, "createdAt" = "createdAt" + interval '14 days'`,
      `update "Instalment" set "dueDate" = "dueDate" + 14`,
    ]);
  });
});
