import { describe, expect, it } from "vitest";
import { formatINR, paiseToRupeeString, percentOf, splitByWeights, toPaise } from "@/lib/money";

describe("money", () => {
  it("parses rupees into integer paise without float drift", () => {
    expect(toPaise("1,25,000")).toBe(12_500_000);
    expect(toPaise("0.1")).toBe(10);
    expect(toPaise(0.29)).toBe(29);
    expect(toPaise("19.995")).toBe(2000);
    expect(toPaise("-5.50")).toBe(-550);
    expect(() => toPaise("abc")).toThrow();
  });

  it("formats with Indian digit grouping", () => {
    expect(formatINR(12_500_000)).toBe("₹1,25,000");
    expect(formatINR(1_234_567_850)).toBe("₹1,23,45,678.50");
    expect(formatINR(-50_000)).toBe("−₹500");
    expect(formatINR(99)).toBe("₹0.99");
    expect(formatINR(100, { alwaysDecimals: true })).toBe("₹1.00");
    expect(paiseToRupeeString(-1005)).toBe("-10.05");
  });

  it("rejects non-integer paise", () => {
    expect(() => formatINR(10.5)).toThrow();
  });

  it("computes basis-point percentages with half-up rounding", () => {
    expect(percentOf(10_000, 1_000)).toBe(1_000);
    expect(percentOf(333, 5_000)).toBe(167);
    expect(percentOf(-333, 5_000)).toBe(-167);
  });

  it("splits amounts exactly with largest remainder", () => {
    expect(splitByWeights(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(splitByWeights(1_000_001, [4_000, 3_000, 3_000])).toEqual([400_001, 300_000, 300_000]);
    const parts = splitByWeights(9_999_999, [3_333, 3_333, 3_334]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(9_999_999);
    expect(() => splitByWeights(10, [])).toThrow();
  });
});

describe("compact money", () => {
  it("abbreviates to lakh and crore for chart labels", () => {
    expect(formatINR(6_000_000, { compact: true })).toBe("₹60,000");
    expect(formatINR(10_000_000, { compact: true })).toBe("₹1 L");
    expect(formatINR(63_150_000, { compact: true })).toBe("₹6.32 L");
    expect(formatINR(280_000_000, { compact: true })).toBe("₹28 L");
    expect(formatINR(9_439_960_200, { compact: true })).toBe("₹9.44 Cr");
    expect(formatINR(12_400_000_000, { compact: true })).toBe("₹12.4 Cr");
    expect(formatINR(-10_600_000, { compact: true })).toBe("−₹1.06 L");
  });
});

describe("dates", async () => {
  const { formatDate, financialYearOf, ageOn, utcDate, istDayStart, istDateOnly, istMonthStart, istWeekday } =
    await import("@/lib/dates");
  it("formats in IST regardless of the host timezone", () => {
    expect(formatDate("2026-10-24T04:00:00Z", "d MMM yyyy, h:mm a")).toBe("24 Oct 2026, 9:30 AM");
    expect(formatDate("2026-10-23T20:00:00Z", "d MMM")).toBe("24 Oct");
    expect(formatDate(utcDate(2026, 4, 10))).toBe("10 Apr 2026");
  });
  it("derives the Indian financial year", () => {
    expect(financialYearOf(utcDate(2026, 5, 15))).toBe("2026-27");
    expect(financialYearOf(utcDate(2027, 2, 10))).toBe("2026-27");
    expect(financialYearOf(utcDate(2027, 4, 1))).toBe("2027-28");
    expect(financialYearOf(new Date("2027-03-31T20:00:00Z"))).toBe("2027-28"); // 1 Apr 01:30 IST
  });
  it("finds IST day and month boundaries whatever the host timezone", () => {
    const lateEvening = new Date("2026-09-30T20:00:00Z"); // 1 Oct 01:30 IST
    expect(istDayStart(lateEvening).toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(istDayStart(lateEvening, 1).toISOString()).toBe("2026-10-01T18:30:00.000Z");
    expect(istDayStart(lateEvening, -1).toISOString()).toBe("2026-09-29T18:30:00.000Z");
    expect(istDateOnly(lateEvening).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(istDateOnly(utcDate(2026, 10, 31), 1).toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(istMonthStart(lateEvening).toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(istMonthStart(lateEvening, -7).toISOString()).toBe("2026-02-28T18:30:00.000Z");
    expect(istMonthStart(utcDate(2027, 1, 15), -1).toISOString()).toBe("2026-11-30T18:30:00.000Z");
    expect(istWeekday(lateEvening)).toBe(4); // Thursday in IST, Wednesday in UTC
    expect(istWeekday(new Date("2026-10-04T06:00:00Z"))).toBe(7);
  });
  it("computes age in completed years", () => {
    expect(ageOn(utcDate(2014, 6, 14), utcDate(2026, 6, 13))).toBe(11);
    expect(ageOn(utcDate(2014, 6, 14), utcDate(2026, 6, 14))).toBe(12);
  });
});
