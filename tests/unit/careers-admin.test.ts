import { describe, expect, it } from "vitest";
import {
  applicationGaps,
  BOARD_STAGES,
  canMoveStage,
  closingInstant,
  monthLabel,
  moveInput,
  openError,
  parseRequirements,
  readScorecard,
  safeguardingFlags,
  scorecardInput,
  scorecardTotal,
  staffContact,
  staffFromApplication,
  stageNoteBody,
  vacancyIsLive,
  vacancyShape,
} from "@/lib/services/careers-admin-rules";
import type { StaffApplicationData } from "@/lib/schemas/staff-application";

describe("pipeline moves", () => {
  it("never leaves or enters DRAFT, and never stays put", () => {
    expect(canMoveStage("DRAFT", "RECEIVED").ok).toBe(false);
    expect(canMoveStage("RECEIVED", "DRAFT").ok).toBe(false);
    expect(canMoveStage("INTERVIEW", "INTERVIEW")).toEqual({ ok: false, reason: "Already in Interview" });
  });

  it("allows forward and backward moves between the working stages", () => {
    expect(canMoveStage("RECEIVED", "SHORTLISTED").ok).toBe(true);
    expect(canMoveStage("SHORTLISTED", "INTERVIEW").ok).toBe(true);
    expect(canMoveStage("INTERVIEW", "SHORTLISTED").ok).toBe(true);
    expect(canMoveStage("OFFER", "REJECTED").ok).toBe(true);
  });

  it("requires an offer before a hire, and treats a hire as final", () => {
    expect(canMoveStage("INTERVIEW", "HIRED")).toEqual({
      ok: false,
      reason: "Make an offer before marking as hired",
    });
    expect(canMoveStage("OFFER", "HIRED").ok).toBe(true);
    expect(canMoveStage("HIRED", "REJECTED").ok).toBe(false);
  });

  it("lets a rejection be reopened, but not straight into a hire", () => {
    expect(canMoveStage("REJECTED", "SHORTLISTED").ok).toBe(true);
    expect(canMoveStage("REJECTED", "HIRED").ok).toBe(false);
  });

  it("needs a reason to reject and none for other moves", () => {
    expect(moveInput.safeParse({ to: "REJECTED" }).success).toBe(false);
    expect(moveInput.safeParse({ to: "REJECTED", reason: "no" }).success).toBe(false);
    expect(
      moveInput.safeParse({ to: "REJECTED", reason: "Did not meet the essential criteria" }).success,
    ).toBe(true);
    expect(moveInput.safeParse({ to: "INTERVIEW" }).success).toBe(true);
    expect(moveInput.safeParse({ to: "DRAFT" }).success).toBe(false);
    expect(BOARD_STAGES).toHaveLength(6);
  });

  it("writes a readable note for each move", () => {
    expect(stageNoteBody("RECEIVED", "REJECTED", "Not registered")).toBe(
      "Moved from Received to Rejected. Reason: Not registered",
    );
    expect(stageNoteBody("OFFER", "HIRED")).toBe("Moved from Offer to Hired.");
  });
});

describe("scorecard", () => {
  const good = {
    subjectKnowledge: "4",
    teachingAndLearning: "5",
    safeguardingAwareness: "3",
    schoolValues: "4",
    references: "5",
  };

  it("accepts five ratings from form strings and totals them", () => {
    const c = scorecardInput.parse(good);
    expect(scorecardTotal(c)).toBe(21);
    expect(c.comment).toBe("");
  });

  it.each(["0", "6", "2.5", "", "abc"])("rejects a rating of %j", (bad) => {
    expect(scorecardInput.safeParse({ ...good, references: bad }).success).toBe(false);
  });

  it("rejects a scorecard with a missing criterion", () => {
    const { references: _omit, ...rest } = good;
    void _omit;
    const r = scorecardInput.safeParse(rest);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe("Score every criterion from 1 to 5");
  });

  it("reads back what was stored, and ignores anything else", () => {
    const stored = {
      ...scorecardInput.parse(good),
      scoredById: "u1",
      scoredByName: "Ishaan Mehra (sample)",
      scoredAt: "2026-09-20T10:00:00.000Z",
    };
    expect(readScorecard(stored)?.scoredByName).toBe("Ishaan Mehra (sample)");
    expect(readScorecard(null)).toBeNull();
    expect(readScorecard({ subjectKnowledge: 9 })).toBeNull();
  });
});

describe("safeguarding flags", () => {
  const base: StaffApplicationData["declaration"] = {
    safeguarding: true,
    convictions: "NONE",
    pendingAction: "NONE",
    consent: true,
    truthful: true,
  };
  it("raises nothing when nothing is declared", () => {
    expect(safeguardingFlags({ declaration: base })).toEqual([]);
    expect(safeguardingFlags({})).toEqual([]);
  });
  it("raises a flag per declaration, with the detail the candidate gave", () => {
    const flags = safeguardingFlags({
      declaration: {
        ...base,
        convictions: "DECLARE",
        convictionsDetail: "A caution in 2009",
        pendingAction: "DECLARE",
      },
    });
    expect(flags.map((f) => f.key)).toEqual(["convictions", "pendingAction"]);
    expect(flags[0]!.detail).toBe("A caution in 2009");
    expect(flags[1]!.detail).toBe("No details were given.");
  });
});

describe("employment gaps", () => {
  const job = (from: string, to: string) => ({ employer: "A school", role: "Teacher", from, to });
  it("finds no gap in continuous employment, including the current post", () => {
    const data: StaffApplicationData = {
      current: { employed: true, since: "2023-09" },
      history: { items: [job("2018-06", "2021-05"), job("2021-06", "2023-08")] },
    };
    expect(applicationGaps(data, "2026-10")).toEqual([]);
  });
  it("reports a gap of three months or more between jobs", () => {
    const data: StaffApplicationData = {
      current: { employed: true, since: "2024-01" },
      history: { items: [job("2018-06", "2021-05"), job("2021-09", "2023-04")] },
    };
    expect(applicationGaps(data, "2026-10")).toEqual([
      { from: "2021-06", to: "2021-08", months: 3 },
      { from: "2023-05", to: "2023-12", months: 8 },
    ]);
  });
  it("counts the time since the last job when the candidate is not employed", () => {
    const data: StaffApplicationData = {
      current: { employed: false },
      history: { items: [job("2019-06", "2026-02")] },
    };
    expect(applicationGaps(data, "2026-10")).toEqual([{ from: "2026-03", to: "2026-09", months: 7 }]);
  });
  it("ignores someone with no history", () => {
    expect(applicationGaps({ current: { employed: false } }, "2026-10")).toEqual([]);
  });
  it("labels months", () => {
    expect(monthLabel("2024-03")).toBe("Mar 2024");
  });
});

describe("vacancy input", () => {
  const valid = {
    title: "Teacher of Geography",
    slug: "teacher-of-geography",
    department: "Humanities",
    employment: "Full-time",
    location: "Kesarbagh campus (sample)",
    summary: "Teach Geography across the Middle and Upper School.",
    description:
      "Join a warm, ambitious team. You will teach Geography from Year 7 to Year 13 and tutor a form.",
    requirements:
      "A degree in Geography\n- QTS or equivalent\n\n  • Safeguarding awareness  \nA degree in Geography",
    closesAt: "2026-12-15",
    status: "OPEN",
  };

  it("parses a requirements textarea into one clean line each", () => {
    const v = vacancyShape.parse(valid);
    expect(v.requirements).toEqual(["A degree in Geography", "QTS or equivalent", "Safeguarding awareness"]);
  });

  it("accepts requirements as an array from the API", () => {
    expect(parseRequirements([" One ", "", "Two"])).toEqual(["One", "Two"]);
    expect(vacancyShape.parse({ ...valid, requirements: ["One", "Two"] }).requirements).toEqual([
      "One",
      "Two",
    ]);
  });

  it("normalises and checks the slug", () => {
    expect(vacancyShape.parse({ ...valid, slug: " Teacher-Of-Geography " }).slug).toBe(
      "teacher-of-geography",
    );
    for (const slug of ["Teacher of Geography", "-bad", "bad-", "a--b", "ab"])
      expect(vacancyShape.safeParse({ ...valid, slug }).success).toBe(false);
  });

  it("rejects a closing date that is not a real calendar date", () => {
    expect(vacancyShape.safeParse({ ...valid, closesAt: "2026-02-30" }).success).toBe(false);
    expect(vacancyShape.safeParse({ ...valid, closesAt: "15/12/2026" }).success).toBe(false);
  });

  it("needs at least one requirement and no more than twenty", () => {
    expect(vacancyShape.safeParse({ ...valid, requirements: "  \n " }).success).toBe(false);
    const many = Array.from({ length: 21 }, (_, i) => `Requirement ${i}`);
    expect(vacancyShape.safeParse({ ...valid, requirements: many }).success).toBe(false);
  });

  it("closes at the end of the chosen day in IST", () => {
    expect(closingInstant("2026-12-15").toISOString()).toBe("2026-12-15T18:29:59.000Z");
  });

  it("only lets a vacancy be open while its closing date is ahead", () => {
    const now = new Date("2026-10-02T06:00:00Z");
    expect(openError({ status: "OPEN", closesAt: "2026-10-01" }, now)).toMatch(/closing date in the future/);
    expect(openError({ status: "OPEN", closesAt: "2026-10-02" }, now)).toBeNull();
    expect(openError({ status: "CLOSED", closesAt: "2026-01-01" }, now)).toBeNull();
    expect(openError({ status: "DRAFT", closesAt: "2026-01-01" }, now)).toBeNull();
  });

  it("is live on the website only when open and not yet closed", () => {
    const now = new Date("2026-10-02T06:00:00Z");
    expect(vacancyIsLive({ status: "OPEN", closesAt: new Date("2026-11-01") }, now)).toBe(true);
    expect(vacancyIsLive({ status: "OPEN", closesAt: new Date("2026-09-01") }, now)).toBe(false);
    expect(vacancyIsLive({ status: "DRAFT", closesAt: new Date("2026-11-01") }, now)).toBe(false);
  });
});

describe("staff details", () => {
  it("prefills the staff form from a hired application, without the title", () => {
    const d = staffFromApplication(
      {
        personal: {
          fullName: "Dr. Meenakshi Rao Iyer",
          phone: "+91 90000 12345",
        } as StaffApplicationData["personal"],
        current: { employed: true, role: "Senior Nurse" },
      },
      { title: "School Nurse", department: "Medical Centre" },
    );
    expect(d).toEqual({
      firstName: "Meenakshi",
      lastName: "Rao Iyer",
      designation: "School Nurse",
      department: "Medical Centre",
      phone: "+91 90000 12345",
    });
  });

  it("falls back to the applicant's current role when there is no vacancy", () => {
    const d = staffFromApplication({ current: { employed: true, role: "Staff Nurse" } }, null);
    expect(d.designation).toBe("Staff Nurse");
    expect(d.firstName).toBe("");
  });

  it("accepts a blank phone or a normal number and rejects junk", () => {
    const base = { designation: "Teacher of Physics", department: "Science" };
    expect(staffContact.parse({ ...base, phone: "" }).phone).toBe("");
    expect(staffContact.parse({ ...base, phone: "+91 00000 01001" }).phone).toBe("+91 00000 01001");
    expect(staffContact.safeParse({ ...base, phone: "call me" }).success).toBe(false);
    expect(staffContact.parse(base).phone).toBe("");
  });
});
