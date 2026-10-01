import { describe, expect, it } from "vitest";
import { leadSchema } from "@/lib/schemas/lead";
import { dobFromParts } from "@/lib/schemas/common";

const base = {
  type: "ENQUIRY" as const,
  source: "drawer" as const,
  parentName: "Asha Menon",
  phone: "+91 98765 43210",
  email: "ASHA@Example.com ",
  classApplying: "Year 7" as const,
  consent: true as const,
};

describe("lead schema", () => {
  it("accepts a minimal enquiry and normalises email", () => {
    const r = leadSchema.parse(base);
    expect(r.email).toBe("asha@example.com");
    expect(r.preferredBoarding).toBe("unsure");
  });

  it.each(["9876543210", "+919876543210", "+91-98765-43210", "91 98765 43210"])(
    "accepts phone %s",
    (phone) => {
      expect(leadSchema.safeParse({ ...base, phone }).success).toBe(true);
    },
  );

  it.each(["12345", "5876543210", "+1 415 555 0100", "98765"])("rejects phone %s", (phone) => {
    expect(leadSchema.safeParse({ ...base, phone }).success).toBe(false);
  });

  it("requires consent", () => {
    expect(leadSchema.safeParse({ ...base, consent: false }).success).toBe(false);
  });

  it("validates partial and impossible dates of birth", () => {
    expect(leadSchema.safeParse({ ...base, dobDay: "3" }).success).toBe(false);
    expect(leadSchema.safeParse({ ...base, dobDay: "31", dobMonth: "2", dobYear: "2015" }).success).toBe(
      false,
    );
    const y = new Date().getFullYear();
    expect(
      leadSchema.safeParse({ ...base, dobDay: "1", dobMonth: "1", dobYear: String(y - 1) }).success,
    ).toBe(false);
    expect(
      leadSchema.safeParse({ ...base, dobDay: "1", dobMonth: "1", dobYear: String(y - 10) }).success,
    ).toBe(true);
    expect(dobFromParts("29", "2", "2016")?.toISOString().slice(0, 10)).toBe("2016-02-29");
    expect(dobFromParts("29", "2", "2015")).toBeNull();
  });

  it("tour bookings need a future non-Sunday date, a slot and 1–4 visitors", () => {
    const future = new Date(Date.now() + 10 * 86400_000);
    if (future.getUTCDay() === 0) future.setUTCDate(future.getUTCDate() + 1);
    const tour = {
      ...base,
      type: "TOUR" as const,
      preferredDate: future.toISOString().slice(0, 10),
      preferredSlot: "11:30",
      visitors: "2",
    };
    expect(leadSchema.safeParse(tour).success).toBe(true);
    expect(leadSchema.safeParse({ ...tour, preferredDate: "2020-01-01" }).success).toBe(false);
    expect(leadSchema.safeParse({ ...tour, visitors: "9" }).success).toBe(false);
    expect(leadSchema.safeParse({ ...tour, preferredSlot: "03:00" }).success).toBe(false);
    const sunday = new Date(future);
    sunday.setUTCDate(sunday.getUTCDate() + ((7 - sunday.getUTCDay()) % 7 || 7));
    expect(leadSchema.safeParse({ ...tour, preferredDate: sunday.toISOString().slice(0, 10) }).success).toBe(
      false,
    );
  });

  it("rejects unknown sources and classes", () => {
    expect(leadSchema.safeParse({ ...base, source: "spam" }).success).toBe(false);
    expect(leadSchema.safeParse({ ...base, classApplying: "Year 14" }).success).toBe(false);
  });
});
