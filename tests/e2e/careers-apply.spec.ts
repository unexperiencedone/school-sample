import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { quietVisitor, uniqueEmail } from "./helpers";
import { testDb } from "./db";
import { validApplication, words } from "../unit/staff-application.fixtures";

// Required fields end their label with an aria-hidden "*", which Playwright counts as label text,
// so labels of required fields are matched with a regex that allows it.
test.use({ reducedMotion: "reduce" });
test.beforeEach(async ({ page }) => quietVisitor(page));

const stamp = Date.now();
const vacancy = {
  slug: `e2e-apply-${stamp}`,
  title: `E2E Teacher of Humanities ${stamp}`,
};

test.beforeAll(async () => {
  await testDb.vacancy.create({
    data: {
      slug: vacancy.slug,
      title: vacancy.title,
      department: "Humanities",
      employment: "Full-time",
      location: "Kesarbagh campus",
      summary: "A vacancy created by the careers e2e spec.",
      description: "Placeholder description.",
      requirements: ["A degree in a relevant subject"],
      closesAt: new Date(Date.now() + 30 * 86_400_000),
      status: "OPEN",
    },
  });
});

test.afterAll(async () => {
  const v = await testDb.vacancy.findUnique({ where: { slug: vacancy.slug } });
  if (!v) return;
  await testDb.staffApplication.deleteMany({ where: { vacancyId: v.id } });
  await testDb.vacancy.delete({ where: { id: v.id } });
});

/** The resume link the app emailed, read from the dev outbox the way a person would click it. */
async function resumeLinkFor(request: APIRequestContext, email: string): Promise<string> {
  let link = "";
  await expect
    .poll(async () => {
      const list = (await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json()) as {
        data: { template: string; view: string }[];
      };
      const row = list.data.find((r) => r.template === "staff-application-resume");
      if (!row) return "";
      const html = await (await request.get(row.view)).text();
      const href = /href="([^"]*\/careers\/apply\?[^"]*)"/.exec(html)?.[1];
      link = href ? href.replaceAll("&amp;", "&") : "";
      return link;
    })
    .toMatch(/resume=/);
  return link;
}

const next = (page: Page) => page.getByRole("button", { name: "Save and continue" }).click();
/** The error summary that takes focus when a step fails validation. */
const summary = (page: Page) => page.getByRole("alert").filter({ hasText: /answers? to fix/ });
const step = (page: Page, n: number) =>
  expect(page.getByRole("heading", { name: new RegExp(`^Step ${n} of 9`) })).toBeVisible();

async function pickMonth(page: Page, id: string, month: string, year: string) {
  await page.locator(`#${id}-month`).selectOption(month);
  await page.locator(`#${id}-year`).selectOption(year);
}

test("nine steps: gap warning, save, resume from the emailed link in a new browser, submit", async ({
  page,
  browser,
}) => {
  const email = uniqueEmail("apply");
  const name = `Careers Tester ${stamp}`;

  // Vacancy pre-selected and shown at the top; the CV note is on step 1
  await page.goto(`/careers/apply?vacancy=${vacancy.slug}`);
  await expect(page.getByText("You are applying for", { exact: true })).toBeVisible();
  await expect(page.getByText(vacancy.title).first()).toBeVisible();
  await expect(page.getByLabel("Role you are applying for")).toHaveValue(vacancy.slug);
  await expect(page.getByText("We cannot accept a CV instead of this form.")).toBeVisible();
  const progress = page.getByRole("list", { name: "Application progress" });
  await expect(progress.locator('[aria-current="step"]')).toContainText("Step 1: Personal details");

  // 1. Personal: client validation first
  await next(page);
  await expect(page.getByText("Please enter a name", { exact: true })).toBeVisible();
  await expect(summary(page)).toBeFocused();
  await summary(page)
    .getByRole("link", { name: /Full name: Please enter a name/ })
    .click();
  await expect(page.locator("#fullName")).toBeFocused();
  await page.getByLabel(/^Title\*?$/).selectOption("Ms");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Date of birth").fill("1988-04-12");
  await page.getByLabel(/^Gender\*?$/).selectOption("FEMALE");
  await page.getByLabel("Nationality").fill("Indian");
  await page.getByLabel("Mobile number").fill("+91 98765 43210");
  await page.getByLabel(/^Email\*?$/).fill(email);
  await page.getByLabel("Home address").fill("12 Placeholder Lane, Sample City 000000");
  await next(page);
  await step(page, 2);
  await expect(page.getByText(/Saved at/)).toBeVisible();
  await expect(progress.locator('[aria-current="step"]')).toContainText("Step 2: Family & emergency contact");
  const draft = await expect
    .poll(async () => testDb.staffApplication.findFirst({ where: { email } }))
    .toMatchObject({ status: "DRAFT", currentStep: 2 })
    .then(async () => testDb.staffApplication.findFirstOrThrow({ where: { email } }));
  expect(draft.ref).toMatch(/^SA-\d{4}-[A-Z2-9]{5}$/);
  expect(draft.resumeTokenHash).toMatch(/^[0-9a-f]{64}$/);

  // 2. Family
  await page.getByRole("button", { name: "Add a child" }).click();
  await page.locator("#child-0-name").fill("Sample Child");
  await page.locator("#child-0-dob").fill("2017-03-09");
  await page.locator("#emergencyName").fill("Sample Contact");
  await page.locator("#emergencyRelation").fill("Sister");
  await page.locator("#emergencyPhone").fill("+91 98765 43211");
  await next(page);

  // 3. Education, with a real signed upload through the storage adapter
  await step(page, 3);
  await page.locator("#edu-0-qualification").fill("B.Ed");
  await page.locator("#edu-0-institution").fill("Sample University");
  await page.locator("#edu-0-year").fill("2010");
  await page.locator("#edu-0-grade").fill("First class");
  await page
    .locator("#edu-0-certificate")
    .setInputFiles(path.join(__dirname, "fixtures/birth-certificate.pdf"));
  await expect(page.getByText("Certificate attached: birth-certificate.pdf")).toBeVisible();
  await next(page);

  // 4. Current employment
  await step(page, 4);
  // Controller-backed controls are reachable from the summary: the yes/no radios, then the month select
  await next(page);
  await expect(summary(page)).toBeFocused();
  await summary(page)
    .getByRole("link", { name: /Currently employed/ })
    .click();
  await expect(page.getByLabel("Yes", { exact: true })).toBeFocused();
  await page.getByLabel("Yes", { exact: true }).check();
  await next(page);
  await expect(summary(page)).toBeFocused();
  await summary(page)
    .getByRole("link", { name: /Started: / })
    .click();
  await expect(page.locator("#since-month")).toBeFocused();
  await page.locator("#employer").fill("Sample School");
  await page.locator("#role").fill("Teacher of History");
  await pickMonth(page, "since", "06", "2019");
  await page.locator("#noticePeriod").fill("Two months");
  await next(page);

  // 5. History: a five-month gap raises a visible warning that does not block
  await step(page, 5);
  await page.getByRole("button", { name: "Add a job" }).click();
  await page.locator("#job-0-employer").fill("First School");
  await page.locator("#job-0-role").fill("Assistant teacher");
  await pickMonth(page, "job-0-from", "01", "2012");
  await pickMonth(page, "job-0-to", "12", "2014");
  await page.getByRole("button", { name: "Add a job" }).click();
  await page.locator("#job-1-employer").fill("Second School");
  await page.locator("#job-1-role").fill("Teacher");
  await pickMonth(page, "job-1-from", "06", "2015");
  await pickMonth(page, "job-1-to", "05", "2019");
  await expect(page.getByText(/Warning: a gap in your employment/)).toBeVisible();
  await expect(page.getByText("Jan 2015 to May 2015 (5 months)")).toBeVisible();
  await next(page);
  await step(page, 6);

  // Leave and come back from the emailed link in a brand new browser (no session storage)
  const link = await resumeLinkFor(page.request, email);
  expect(link.startsWith("http")).toBe(true);
  const other = await browser.newContext({ reducedMotion: "reduce" });
  const page2 = await other.newPage();
  await quietVisitor(page2);
  await page2.goto(link);
  await step(page2, 6);
  await expect(page2.getByText(/Welcome back/)).toBeVisible();
  await expect(page2).not.toHaveURL(/resume=/);

  // Back keeps what was entered, including the gap
  await page2.getByRole("button", { name: "Back" }).click();
  await step(page2, 5);
  await expect(page2.locator("#job-1-employer")).toHaveValue("Second School");
  await expect(page2.getByText("Jan 2015 to May 2015 (5 months)")).toBeVisible();
  await next(page2);

  // 6. Interests: checkbox chips
  await step(page2, 6);
  await next(page2);
  await expect(page2.getByText("Choose at least one subject or area", { exact: true })).toBeVisible();
  await page2.getByText("History", { exact: true }).click();
  await page2.getByText("Geography", { exact: true }).click();
  await expect(page2.getByLabel("History", { exact: true })).toBeChecked();
  await page2.getByText(/^Middle School/).click();
  await next(page2);

  // 7. Statement: live counter, minimum enforced, gap reminder
  await step(page2, 7);
  await expect(page2.getByText("Jan 2015 to May 2015 (5 months)")).toBeVisible();
  await page2.locator("#statement").fill(words(10));
  await expect(page2.getByText(/10 words/)).toBeVisible();
  await next(page2);
  await expect(page2.getByText("Write at least 150 words", { exact: true })).toBeVisible();
  await page2.locator("#statement").fill(words(160));
  await expect(page2.getByText(/160 words/)).toBeVisible();
  await next(page2);

  // 8. References: one must be the current employer
  await step(page2, 8);
  for (const [i, who] of [
    [0, "Head Teacher"],
    [1, "Former Colleague"],
  ] as const) {
    await page2.locator(`#ref-${i}-name`).fill(who);
    await page2.locator(`#ref-${i}-role`).fill("Principal");
    await page2.locator(`#ref-${i}-organisation`).fill(i === 0 ? "Sample School" : "First School");
    await page2.locator(`#ref-${i}-relationship`).fill("Line manager");
    await page2.locator(`#ref-${i}-email`).fill(`referee${i}.${stamp}@example.com`);
  }
  await next(page2);
  await expect(
    page2.locator("p[role=alert]", {
      hasText: "One referee must be your current (or most recent) employer",
    }),
  ).toBeVisible();
  await page2.locator("#ref-0-current").check();
  await next(page2);

  // 9. Declaration: validation, conditional detail, then submit
  await step(page2, 9);
  await page2.getByRole("button", { name: "Submit application" }).click();
  await expect(page2.getByText("Please confirm the safeguarding statement", { exact: true })).toBeVisible();
  await expect(page2.getByText("Please answer this question").first()).toBeVisible();
  await page2.locator("#safeguarding").check();
  const convictions = page2.getByRole("group", { name: /convicted of a criminal offence/ });
  await convictions.getByLabel("Yes, I need to give details").check();
  await page2.locator("#consent").check();
  await page2.locator("#truthful").check();
  await page2
    .getByRole("group", { name: /criminal or disciplinary action pending/ })
    .getByLabel("No")
    .check();
  await page2.getByRole("button", { name: "Submit application" }).click();
  await expect(
    page2.getByText("Please give details so we can consider them fairly", { exact: true }),
  ).toBeVisible();
  await convictions.getByLabel("No", { exact: true }).check();
  await expect(page2.locator("#convictionsDetail")).toHaveCount(0);
  await page2.getByRole("button", { name: "Submit application" }).click();

  // Success screen
  await expect(page2.getByRole("heading", { name: "Application received" })).toBeVisible();
  await expect(page2.getByTestId("application-ref")).toHaveText(draft.ref);
  await expect(page2.getByRole("link", { name: "Back to vacancies" })).toHaveAttribute(
    "href",
    "/careers/vacancies",
  );

  // Database: RECEIVED with the applicant's name, linked to the vacancy, certificate stored for this draft
  const v = await testDb.vacancy.findUniqueOrThrow({ where: { slug: vacancy.slug } });
  await expect
    .poll(async () => (await testDb.staffApplication.findUniqueOrThrow({ where: { id: draft.id } })).status)
    .toBe("RECEIVED");
  const row = await testDb.staffApplication.findUniqueOrThrow({ where: { id: draft.id } });
  expect(row).toMatchObject({ fullName: name, currentStep: 9, vacancyId: v.id, email });
  expect(row.submittedAt).toBeTruthy();
  const data = row.data as {
    personal: { fullName: string };
    education: { items: { certificateKey: string }[] };
    interests: { subjects: string[] };
    declaration: { convictions: string; convictionsDetail?: string };
  };
  expect(data.personal.fullName).toBe(name);
  expect(data.interests.subjects).toEqual(expect.arrayContaining(["History", "Geography"]));
  expect(data.education.items[0]!.certificateKey).toMatch(
    new RegExp(`^staff-application/${draft.id}/education-0-[0-9a-f]+\\.pdf$`),
  );
  expect(data.declaration.convictions).toBe("NONE");
  expect(data.declaration.convictionsDetail ?? "").toBe("");
  const upload = await testDb.upload.findUniqueOrThrow({
    where: { key: data.education.items[0]!.certificateKey },
  });
  expect(upload).toMatchObject({ status: "STORED", ownerType: "staff-application" });

  // Emails: resume link when the draft was created, confirmation on submit
  await expect
    .poll(async () => (await testDb.outbox.findMany({ where: { to: email } })).map((o) => o.template).sort())
    .toEqual(["staff-application-received", "staff-application-resume"]);
  const received = await testDb.outbox.findFirstOrThrow({
    where: { to: email, template: "staff-application-received" },
  });
  expect((received.payload as { data: { ref: string; role: string; name: string } }).data).toEqual({
    ref: draft.ref,
    role: vacancy.title,
    name,
  });
  expect(await testDb.auditLog.count({ where: { entity: "StaffApplication", entityId: draft.id } })).toBe(1);

  // A submitted application can no longer be edited, and its resume link only reports the status
  const token = new URL(link).searchParams.get("resume")!;
  const edit = await page2.request.post("/api/staff-applications", {
    data: { id: draft.id, token, step: 2, data: validApplication().family, action: "save" },
  });
  expect(edit.status()).toBe(409);
  expect((await edit.json()).error.code).toBe("ALREADY_SUBMITTED");
  const view = await page2.request.get(`/api/staff-applications/${draft.id}?token=${token}`);
  expect(await view.json()).toMatchObject({ status: "RECEIVED", ref: draft.ref, data: {} });
  await page2.goto(link);
  await expect(page2.getByRole("heading", { name: "This application has been submitted" })).toBeVisible();
  await other.close();
});

test("API: no CV path, unsaved referees are rejected, tokens are enforced, submit is final", async ({
  request,
}) => {
  const email = uniqueEmail("apply-api");
  const app = validApplication();
  const post = (data: object) => request.post("/api/staff-applications", { data });

  // Step 1 creates the draft. A "cv" field is not part of the form, so it is dropped.
  const created = await post({
    step: 1,
    action: "save",
    vacancySlug: vacancy.slug,
    data: { ...app.personal, email, cv: "my-cv.pdf" },
  });
  expect(created.status()).toBe(201);
  const { id, ref, resumeToken } = await created.json();
  expect(ref).toMatch(/^SA-\d{4}-[A-Z2-9]{5}$/);
  expect(resumeToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
  const row = await testDb.staffApplication.findUniqueOrThrow({ where: { id } });
  expect(row.resumeTokenHash).toMatch(/^[0-9a-f]{64}$/);
  expect(row.resumeTokenHash).not.toContain(resumeToken);
  expect(JSON.stringify(row.data)).not.toContain("my-cv.pdf");

  // Tokens: none, wrong, and right
  const save = (step: number, data: unknown, token: string | undefined = resumeToken) =>
    post({ id, token, step, data, action: "save" });
  expect((await save(2, app.family, "")).status()).toBe(422); // too short to be a token
  expect((await post({ id, step: 2, data: app.family, action: "save" })).status()).toBe(401);
  expect((await save(2, app.family, "x".repeat(32))).status()).toBe(403);
  const later = await save(2, app.family);
  expect(later.status()).toBe(200);
  expect((await later.json()).resumeToken).toBeUndefined();
  expect((await request.get(`/api/staff-applications/${id}`)).status()).toBe(401);
  expect((await request.get(`/api/staff-applications/${id}?token=${"x".repeat(32)}`)).status()).toBe(403);
  const draft = await (await request.get(`/api/staff-applications/${id}?token=${resumeToken}`)).json();
  expect(draft).toMatchObject({ id, ref, status: "DRAFT", currentStep: 3, vacancy: { slug: vacancy.slug } });
  expect(draft.data.personal.email).toBe(email);

  // Steps 3 to 7
  for (const [n, key] of [
    [3, "education"],
    [4, "current"],
    [5, "history"],
    [6, "interests"],
    [7, "statement"],
  ] as const)
    expect((await save(n, app[key])).status(), key).toBe(200);

  // A step that fails its schema is refused with per-field issues
  const shortStatement = await save(7, { text: "far too short" });
  expect(shortStatement.status()).toBe(422);
  expect((await shortStatement.json()).error).toMatchObject({ code: "VALIDATION_FAILED" });

  // Missing referee: one referee is refused, and so are two with nobody marked as the current employer
  const [first, second] = app.references.items;
  const one = await save(8, { items: [first] });
  expect(one.status()).toBe(422);
  const oneBody = await one.json();
  expect(oneBody.error.details.issues.map((i: { path: string }) => i.path)).toContain("items");
  const noCurrent = await save(8, { items: [{ ...first, isCurrentEmployer: false }, second] });
  expect(noCurrent.status()).toBe(422);
  expect((await noCurrent.json()).error.details.issues[0].message).toMatch(/current/);

  // Submit without the references step: the whole application is checked and the first failing step is named
  const submitBody = { id, token: resumeToken, step: 9, data: app.declaration, action: "submit" };
  const incomplete = await post(submitBody);
  expect(incomplete.status()).toBe(422);
  const incompleteBody = await incomplete.json();
  expect(incompleteBody.error.code).toBe("INCOMPLETE");
  expect(incompleteBody.error.details.firstStep).toBe(8);
  expect(Object.keys(incompleteBody.error.details.steps)).toEqual(["references"]);
  expect((await testDb.staffApplication.findUniqueOrThrow({ where: { id } })).status).toBe("DRAFT");
  expect(await testDb.outbox.count({ where: { to: email, template: "staff-application-received" } })).toBe(0);

  // A declaration with a "Yes" answer and no detail is also incomplete (detail text is required)
  expect((await save(8, app.references)).status()).toBe(200);
  const noDetail = await post({
    ...submitBody,
    data: { ...app.declaration, convictions: "DECLARE", convictionsDetail: "" },
  });
  expect(noDetail.status()).toBe(422);
  expect((await noDetail.json()).error.details.firstStep).toBe(9);

  // Complete: submit succeeds once, then the application is read-only
  const done = await post(submitBody);
  expect(done.status()).toBe(200);
  expect(await done.json()).toMatchObject({ id, ref, status: "RECEIVED" });
  expect((await post(submitBody)).status()).toBe(409);
  expect((await save(2, app.family)).status()).toBe(409);
  const final = await testDb.staffApplication.findUniqueOrThrow({ where: { id } });
  expect(final).toMatchObject({ status: "RECEIVED", fullName: app.personal.fullName, currentStep: 9 });
});

test("API: drafts expire after 14 days and certificates must belong to the draft", async ({ request }) => {
  const email = uniqueEmail("apply-expiry");
  const app = validApplication();
  const created = await request.post("/api/staff-applications", {
    data: { step: 1, action: "save", data: { ...app.personal, email } },
  });
  const { id, resumeToken } = await created.json();

  // A certificate key that this application never uploaded is refused
  const forged = await request.post("/api/staff-applications", {
    data: {
      id,
      token: resumeToken,
      step: 3,
      action: "save",
      data: {
        items: [
          { ...app.education.items[0], certificateKey: "staff-application/someone-else/education-0-abc.pdf" },
        ],
      },
    },
  });
  expect(forged.status()).toBe(422);
  expect((await forged.json()).error.details.issues[0].path).toBe("items.0.certificateKey");

  // Unknown upload slots are refused
  const badSlot = await request.post(`/api/staff-applications/${id}/documents`, {
    headers: { "x-resume-token": resumeToken },
    data: { slot: "cv", fileName: "cv.pdf", mime: "application/pdf", size: 1000 },
  });
  expect(badSlot.status()).toBe(422);
  const noToken = await request.post(`/api/staff-applications/${id}/documents`, {
    data: { slot: "education-0", fileName: "a.pdf", mime: "application/pdf", size: 1000 },
  });
  expect(noToken.status()).toBe(401);

  // Resume links last 14 days from the last save
  await testDb.staffApplication.update({
    where: { id },
    data: { updatedAt: new Date(Date.now() - 15 * 86_400_000) },
  });
  const expired = await request.get(`/api/staff-applications/${id}?token=${resumeToken}`);
  expect(expired.status()).toBe(410);
  expect((await expired.json()).error.code).toBe("EXPIRED");
});

test("API: the honeypot silently succeeds and stores nothing", async ({ request }) => {
  const email = uniqueEmail("apply-bot");
  const res = await request.post("/api/staff-applications", {
    data: {
      step: 1,
      action: "save",
      website: "http://spam.example",
      data: { ...validApplication().personal, email },
    },
  });
  expect(res.status()).toBe(201);
  expect(await testDb.staffApplication.count({ where: { email } })).toBe(0);
  expect(await testDb.outbox.count({ where: { to: email } })).toBe(0);
});

test("axe: the form has no serious or critical issues on steps 1 and 2", async ({ page }) => {
  const scan = async (label: string) => {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    const bad = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(bad.map((v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual(
      [],
    );
  };
  await page.goto(`/careers/apply?vacancy=${vacancy.slug}`);
  await expect(page.getByRole("heading", { name: /^Step 1 of 9/ })).toBeVisible();
  await scan("step 1");
  await next(page); // errors showing
  await scan("step 1 with errors");
  const app = validApplication();
  await page.getByLabel(/^Title\*?$/).selectOption("Ms");
  await page.getByLabel("Full name").fill(app.personal.fullName);
  await page.getByLabel("Date of birth").fill(app.personal.dob);
  await page.getByLabel(/^Gender\*?$/).selectOption("FEMALE");
  await page.getByLabel("Nationality").fill("Indian");
  await page.getByLabel("Mobile number").fill(app.personal.phone);
  await page.getByLabel(/^Email\*?$/).fill(uniqueEmail("apply-axe"));
  await page.getByLabel("Home address").fill(app.personal.address);
  await next(page);
  await step(page, 2);
  await page.getByRole("button", { name: "Add a child" }).click();
  await scan("step 2");
});
