import { describe, expect, it } from "vitest";
import { validateAll } from "@/lib/schemas/staff-application";
import {
  ageOnDate,
  applicationIssues,
  describeGap,
  firstFailingStep,
  friendlyMessage,
  gapsFor,
  jobsForGaps,
  monthLabel,
  stepKeyFor,
  tidyDeclaration,
  FORM_SCHEMAS,
} from "@/components/forms/staff-application/rules";
import { validApplication, words } from "./staff-application.fixtures";

describe("application rules", () => {
  it("accepts a complete application, and everything it accepts passes the shared validateAll", () => {
    const data = validApplication();
    expect(applicationIssues(data)).toEqual({});
    expect(validateAll(data).ok).toBe(true);
  });

  it("fails every required step of an empty application and points at step 1", () => {
    const issues = applicationIssues({});
    // History may be empty (a first job), so it is the one step that passes with nothing in it.
    expect(Object.keys(issues).sort()).toEqual(
      [
        "current",
        "declaration",
        "education",
        "family",
        "interests",
        "personal",
        "references",
        "statement",
      ].sort(),
    );
    expect(firstFailingStep(issues)).toBe(1);
  });

  it("points at the first failing step, not the first step", () => {
    const data = validApplication();
    data.statement = { text: "too short" };
    data.declaration = { ...data.declaration, truthful: false as never };
    expect(firstFailingStep(applicationIssues(data))).toBe(7);
  });

  describe("personal", () => {
    const parse = (dob: string) => FORM_SCHEMAS.personal.safeParse({ ...validApplication().personal, dob });
    it("rejects a date of birth in the future", () => {
      const r = parse("2999-01-01");
      expect(r.success).toBe(false);
      expect(!r.success && r.error.issues[0]?.message).toMatch(/future/);
    });
    it("requires applicants to be 18", () => {
      const year = new Date().getUTCFullYear() - 17;
      expect(parse(`${year}-01-01`).success).toBe(false);
      expect(parse("1990-01-01").success).toBe(true);
    });
    it("normalises the email", () => {
      const r = FORM_SCHEMAS.personal.parse(validApplication().personal);
      expect(r.email).toBe("test.applicant@example.com");
    });
  });

  it("computes completed years without time zones", () => {
    expect(ageOnDate("2000-06-15", "2018-06-14")).toBe(17);
    expect(ageOnDate("2000-06-15", "2018-06-15")).toBe(18);
    expect(ageOnDate("2000-12-31", "2026-01-01")).toBe(25);
  });

  describe("current employment", () => {
    it("needs employer, title and start month when employed", () => {
      const r = FORM_SCHEMAS.current.safeParse({ employed: true });
      expect(r.success).toBe(false);
      expect(!r.success && r.error.issues.map((i) => i.path[0]).sort()).toEqual([
        "employer",
        "role",
        "since",
      ]);
    });
    it("needs nothing else when not employed", () => {
      expect(FORM_SCHEMAS.current.safeParse({ employed: false }).success).toBe(true);
    });
  });

  describe("statement", () => {
    it("enforces the word window", () => {
      expect(FORM_SCHEMAS.statement.safeParse({ text: words(149) }).success).toBe(false);
      expect(FORM_SCHEMAS.statement.safeParse({ text: words(150) }).success).toBe(true);
      expect(FORM_SCHEMAS.statement.safeParse({ text: words(700) }).success).toBe(true);
      expect(FORM_SCHEMAS.statement.safeParse({ text: words(701) }).success).toBe(false);
    });
    it("caps raw length so one enormous word cannot slip through", () => {
      const huge = `${"x".repeat(9000)} ${words(150)}`;
      expect(FORM_SCHEMAS.statement.safeParse({ text: huge }).success).toBe(false);
    });
  });

  describe("references", () => {
    it("needs two referees, one of them the current employer", () => {
      const [first, second] = validApplication().references.items;
      expect(FORM_SCHEMAS.references.safeParse({ items: [first] }).success).toBe(false);
      expect(
        FORM_SCHEMAS.references.safeParse({ items: [{ ...first!, isCurrentEmployer: false }, second] })
          .success,
      ).toBe(false);
      expect(FORM_SCHEMAS.references.safeParse({ items: [first, second] }).success).toBe(true);
    });
  });

  describe("declaration", () => {
    const base = validApplication().declaration;
    it("asks for details when something is declared", () => {
      const r = FORM_SCHEMAS.declaration.safeParse({
        ...base,
        convictions: "DECLARE",
        convictionsDetail: "",
      });
      expect(r.success).toBe(false);
      expect(!r.success && r.error.issues[0]?.path).toEqual(["convictionsDetail"]);
      const pending = FORM_SCHEMAS.declaration.safeParse({ ...base, pendingAction: "DECLARE" });
      expect(!pending.success && pending.error.issues[0]?.path).toEqual(["pendingActionDetail"]);
    });
    it("accepts a declaration with detail", () => {
      const r = FORM_SCHEMAS.declaration.safeParse({
        ...base,
        convictions: "DECLARE",
        convictionsDetail: "A minor traffic offence in 2009; fine paid.",
      });
      expect(r.success).toBe(true);
    });
    it("requires all four confirmations", () => {
      for (const field of ["safeguarding", "consent", "truthful"] as const)
        expect(FORM_SCHEMAS.declaration.safeParse({ ...base, [field]: false }).success).toBe(false);
    });
    it("explains an unticked box in plain words", () => {
      const r = FORM_SCHEMAS.declaration.safeParse({
        ...base,
        safeguarding: false,
        consent: false,
        truthful: false,
      });
      expect(!r.success && r.error.issues.map((i) => i.message)).toEqual([
        "Please confirm the safeguarding statement",
        "We need your consent to process the application",
        "Please confirm the information is accurate",
      ]);
    });
    it("drops detail text next to a No answer", () => {
      const tidy = tidyDeclaration({
        ...base,
        convictionsDetail: "left over",
        pendingActionDetail: "left over",
      });
      expect(tidy.convictionsDetail).toBe("");
      expect(tidy.pendingActionDetail).toBe("");
    });
  });
});

describe("employment gaps", () => {
  it("reports a gap of three months or more between jobs", () => {
    const data = validApplication();
    data.history = {
      items: [
        { employer: "A", role: "Teacher", from: "2012-01", to: "2014-12", reasonForLeaving: "" },
        { employer: "B", role: "Teacher", from: "2015-06", to: "2019-05", reasonForLeaving: "" },
      ],
    };
    const gaps = gapsFor(data, "2026-10");
    expect(gaps).toEqual([{ from: "2015-01", to: "2015-05", months: 5 }]);
    expect(describeGap(gaps[0]!)).toBe("Jan 2015 to May 2015 (5 months)");
  });

  it("does not report short gaps or contiguous jobs", () => {
    const data = validApplication();
    expect(gapsFor(data, "2026-10")).toEqual([]);
  });

  it("includes the current post, which runs to now, and finds a gap before it", () => {
    const data = validApplication();
    data.current = { ...data.current, since: "2020-01" };
    expect(gapsFor(data, "2026-10")).toEqual([{ from: "2019-06", to: "2019-12", months: 7 }]);
  });

  it("ignores half-typed rows", () => {
    const jobs = jobsForGaps(
      {
        history: {
          items: [
            { employer: "A", role: "B", from: "2012-01", to: "" },
            { employer: "A", role: "B", from: "", to: "2012-01" },
            { employer: "A", role: "B", from: "2014-01", to: "2013-01" },
          ],
        },
        current: { employed: false },
      },
      "2026-10",
    );
    expect(jobs).toEqual([]);
  });
});

describe("presentation helpers", () => {
  it("formats months", () => {
    expect(monthLabel("2019-03")).toBe("Mar 2019");
    expect(monthLabel("garbage")).toBe("garbage");
  });
  it("replaces Zod's default wording", () => {
    expect(friendlyMessage("Required")).toBe("This field is required");
    expect(friendlyMessage("String must contain at least 2 character(s)")).toBe(
      "Enter at least 2 characters",
    );
    expect(friendlyMessage("Number must be greater than or equal to 1960")).toBe("Enter a valid year");
    expect(friendlyMessage("Provide two referees")).toBe("Provide two referees");
  });
  it("maps step numbers to keys", () => {
    expect(stepKeyFor(1)).toBe("personal");
    expect(stepKeyFor(9)).toBe("declaration");
    expect(stepKeyFor(0)).toBeNull();
    expect(stepKeyFor(10)).toBeNull();
  });
});
