import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { loginAs, quietVisitor } from "./helpers";
import { testDb } from "./db";

test.use({ reducedMotion: "reduce" });

const tag = () =>
  Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");

async function axe(page: Page, label: string) {
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => document.getElementById("crm-root")?.setAttribute("data-theme", t), theme);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    const bad = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(
      bad.map(
        (v) =>
          `${label} (${theme}) ${v.id}: ${v.nodes
            .map((n) => n.target.join(" "))
            .slice(0, 3)
            .join(" | ")}`,
      ),
    ).toEqual([]);
  }
}

/** A complete application form, so every section of the application page has something to show. */
function formData(name: string, email: string) {
  return {
    personal: {
      title: "Ms",
      fullName: name,
      dob: "1990-04-12",
      gender: "FEMALE",
      nationality: "Indian",
      email,
      phone: "+91 90000 12345",
      address: "12, Sample Lane, Pune 411001",
      noticeOrAvailability: "One month's notice",
    },
    family: {
      maritalStatus: "Single",
      children: [],
      emergencyName: "Sample Parent",
      emergencyRelation: "Parent",
      emergencyPhone: "+91 90000 54321",
    },
    education: {
      items: [
        {
          qualification: "B.Sc. Mathematics",
          institution: "Deccan Plateau University",
          year: 2012,
          grade: "First class",
        },
      ],
    },
    current: {
      employed: true,
      employer: "A girls' day school in Pune",
      role: "Mathematics Teacher",
      since: "2020-06",
      noticePeriod: "One month",
      reasonForLeaving: "Seeking more responsibility",
    },
    history: { items: [] },
    interests: { subjects: ["Mathematics"], phases: ["Middle School (Years 7–9)"], interests: "Chess" },
    statement: { text: "A short sample statement written for the end to end tests." },
    references: {
      items: [
        {
          name: "Sample Referee",
          role: "Head of Department",
          organisation: "A girls' day school in Pune",
          email: "referee@referee-sample.test",
          phone: "",
          relationship: "Line manager",
          isCurrentEmployer: true,
        },
      ],
    },
    declaration: {
      safeguarding: true,
      convictions: "NONE",
      convictionsDetail: "",
      pendingAction: "NONE",
      pendingActionDetail: "",
      consent: true,
      truthful: true,
    },
  };
}

const created = { applications: [] as string[], staff: [] as string[], vacancies: [] as string[] };

async function makeApplication(status: "RECEIVED" | "SHORTLISTED" | "OFFER" | "HIRED", sameEmailAs?: string) {
  const id = tag();
  const name = `Testwell Applicant ${id}`;
  const email = sameEmailAs ?? `e2e.${id}@applicant-sample.test`;
  const vacancy = await testDb.vacancy.findUniqueOrThrow({ where: { slug: "teacher-of-mathematics" } });
  const app = await testDb.staffApplication.create({
    data: {
      ref: `SA-E2E-${id.toUpperCase()}`,
      vacancyId: vacancy.id,
      email,
      fullName: name,
      status,
      currentStep: 9,
      data: formData(name, email),
      submittedAt: new Date(),
    },
  });
  created.applications.push(app.id);
  return { app, name, email };
}

test.afterAll(async () => {
  await testDb.staff.deleteMany({ where: { email: { in: created.staff } } });
  await testDb.staffApplication.deleteMany({ where: { id: { in: created.applications } } });
  await testDb.vacancy.deleteMany({ where: { slug: { in: created.vacancies } } });
});

test("HR moves an application on, adds a note, scores it and downloads the PDF", async ({ page }) => {
  const { app, name } = await makeApplication("SHORTLISTED");
  await loginAs(page, "hr");
  await page.goto("/admin/careers");
  await expect(page.getByRole("heading", { level: 1, name: "Staff applications" })).toBeVisible();

  // Search narrows the board to the one card, which sits in the Shortlisted column
  await page.getByRole("searchbox", { name: "Search applications" }).fill(name);
  await expect(page).toHaveURL(/q=/);
  const shortlisted = page.getByTestId("column-SHORTLISTED");
  await expect(shortlisted.getByRole("link", { name })).toBeVisible();
  await expect(page.getByTestId("column-INTERVIEW").getByRole("link", { name })).toHaveCount(0);
  await shortlisted.getByRole("link", { name }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/careers/${app.id}$`));
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

  // All nine steps are on the page
  for (const title of [
    "Personal details",
    "Family & emergency contact",
    "Education & training",
    "Current employment",
    "Employment history",
    "Subjects & interests",
    "Personal statement",
    "References",
    "Declaration",
  ])
    await expect(
      page.getByRole("heading", { level: 2, name: new RegExp(`^\\d\\. ${title}$`) }),
    ).toBeVisible();

  // Shortlisted -> Interview
  await page.getByLabel("Move to").selectOption({ label: "Interview" });
  await page.getByRole("button", { name: "Move application" }).click();
  await expect
    .poll(async () => (await testDb.staffApplication.findUniqueOrThrow({ where: { id: app.id } })).status)
    .toBe("INTERVIEW");
  await expect(page.getByText("Moved from Shortlisted to Interview.")).toBeVisible();
  expect(
    await testDb.auditLog.count({ where: { entityId: app.id, action: "staff_application.stage" } }),
  ).toBe(1);

  // Internal note, newest first
  await page.getByLabel("Add an internal note").fill("Phoned the referee: very positive (e2e)");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("Phoned the referee: very positive (e2e)")).toBeVisible();
  await expect
    .poll(() =>
      testDb.staffApplicationNote.count({
        where: { applicationId: app.id, body: "Phoned the referee: very positive (e2e)" },
      }),
    )
    .toBe(1);
  const notes = page.getByRole("list", { name: "Notes, newest first" }).getByRole("listitem");
  await expect(notes.first()).toContainText("Phoned the referee");

  // Scorecard: 4 + 5 + 3 + 4 + 5 = 21 out of 25
  const ratings: [string, string][] = [
    ["Subject knowledge", "4"],
    ["Teaching and learning", "5"],
    ["Safeguarding awareness", "3"],
    ["Fit with school values", "4"],
    ["References", "5"],
  ];
  for (const [criterion, n] of ratings)
    await page
      .getByRole("group", { name: criterion })
      .locator("label", { hasText: new RegExp(`^${n}$`) })
      .click();
  await expect(page.getByTestId("score-total")).toHaveText("21");
  await page.getByRole("button", { name: "Save scorecard" }).click();
  await expect
    .poll(async () => (await testDb.staffApplication.findUniqueOrThrow({ where: { id: app.id } })).score)
    .toBe(21);
  const saved = await testDb.staffApplication.findUniqueOrThrow({ where: { id: app.id } });
  expect(saved.scorecard).toMatchObject({
    subjectKnowledge: 4,
    teachingAndLearning: 5,
    safeguardingAwareness: 3,
  });

  // PDF: the button downloads it, and the route answers with a real PDF
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download PDF" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`${app.ref}.pdf`);
  const res = await page.request.get(`/api/admin/staff-applications/${app.id}/pdf`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/pdf");
  expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");
  await expect
    .poll(() =>
      testDb.auditLog.count({ where: { entityId: app.id, action: "staff_application.export_pdf" } }),
    )
    .toBeGreaterThanOrEqual(2);
});

test("rejecting from the board asks for a reason and records it", async ({ page }) => {
  const { app, name } = await makeApplication("RECEIVED");
  await loginAs(page, "hr");
  await page.goto(`/admin/careers?q=${encodeURIComponent(name)}`);
  await expect(page.getByTestId("column-RECEIVED").getByRole("link", { name })).toBeVisible();
  // A hire must follow an offer: that option can't even be chosen from Received
  await expect(
    page.getByLabel(`Move ${name} to`).locator("option", { hasText: "Move to Hired" }),
  ).toHaveAttribute("disabled", "");

  await page.getByLabel(`Move ${name} to`).selectOption({ label: "Move to Rejected" });
  const dialog = page.getByRole("dialog", { name: /^Reject / });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Reason for rejecting").fill("Does not meet the essential criteria (e2e)");
  await dialog.getByRole("button", { name: "Reject application" }).click();
  await expect(page.getByTestId("column-REJECTED").getByRole("link", { name })).toBeVisible();
  await expect
    .poll(async () => (await testDb.staffApplication.findUniqueOrThrow({ where: { id: app.id } })).status)
    .toBe("REJECTED");
  expect(
    await testDb.auditLog.count({
      where: {
        entityId: app.id,
        action: "staff_application.stage",
        reason: "Does not meet the essential criteria (e2e)",
      },
    }),
  ).toBe(1);
  const note = await testDb.staffApplicationNote.findFirstOrThrow({ where: { applicationId: app.id } });
  expect(note.body).toBe(
    "Moved from Received to Rejected. Reason: Does not meet the essential criteria (e2e)",
  );
});

test("a hired applicant is added to the staff directory once", async ({ page }) => {
  const { app, name, email } = await makeApplication("OFFER");
  created.staff.push(email);
  await loginAs(page, "hr");
  await page.goto(`/admin/careers/${app.id}`);
  await expect(page.getByRole("button", { name: "Add to staff directory" })).toHaveCount(0);

  await page.getByLabel("Move to").selectOption({ label: "Hired" });
  await page.getByRole("button", { name: "Move application" }).click();
  await expect(page.getByRole("button", { name: "Add to staff directory" })).toBeVisible();
  await expect(page.getByLabel("First name")).toHaveValue("Testwell");
  await expect(page.getByLabel("Last name")).toHaveValue(`Applicant ${name.split(" ").at(-1)}`);
  await expect(page.getByLabel("Designation")).toHaveValue("Teacher of Mathematics");
  await page.getByRole("button", { name: "Add to staff directory" }).click();

  await expect(page).toHaveURL(/\/admin\/careers\/staff/);
  await expect.poll(() => testDb.staff.count({ where: { email } })).toBe(1);
  expect(
    await testDb.auditLog.count({
      where: { action: "staff.create", reason: `Hired from application ${app.ref}` },
    }),
  ).toBe(1);

  await page.goto(`/admin/careers/staff?q=${encodeURIComponent(email)}`);
  await expect(page.getByText(email)).toBeVisible();
  await page.goto(`/admin/careers/${app.id}`);
  await expect(page.getByText("In the staff directory:")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to staff directory" })).toHaveCount(0);

  // Someone with the same email is already in the directory: no second record can be created from another application
  const { app: second } = await makeApplication("HIRED", email);
  await page.goto(`/admin/careers/${second.id}`);
  await expect(page.getByText("In the staff directory:")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to staff directory" })).toHaveCount(0);
  await expect.poll(() => testDb.staff.count({ where: { email } })).toBe(1);
});

test("HR edits a staff member's role, department and phone from the directory", async ({ page }) => {
  const person = await testDb.staff.create({
    data: {
      firstName: "Edith",
      lastName: `Testwell${tag()}`,
      email: `e2e.staff.${tag()}@aurelia-sample.test`,
      designation: "Teacher of Physics",
      department: "Science",
      joinedOn: new Date("2026-04-01T00:00:00Z"),
    },
  });
  created.staff.push(person.email);
  await loginAs(page, "hr");
  await page.goto(`/admin/careers/staff?q=${encodeURIComponent(person.lastName)}`);
  await expect(page.getByTestId(`staff-${person.id}`)).toBeVisible();
  await page.getByRole("button", { name: `Edit Edith ${person.lastName}` }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Designation").fill("Head of Physics");
  await dialog.getByLabel("Phone").fill("+91 90000 11111");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect
    .poll(async () => (await testDb.staff.findUniqueOrThrow({ where: { id: person.id } })).designation)
    .toBe("Head of Physics");
  expect((await testDb.staff.findUniqueOrThrow({ where: { id: person.id } })).phone).toBe("+91 90000 11111");
  expect(await testDb.auditLog.count({ where: { entityId: person.id, action: "staff.update" } })).toBe(1);
  await expect(page.getByTestId(`staff-${person.id}`)).toContainText("Head of Physics");

  // The directory filters by department
  await page.goto("/admin/careers/staff");
  await page.getByLabel("Department").selectOption("Science");
  await expect(page).toHaveURL(/department=Science/);
  await expect(page.getByTestId(`staff-${person.id}`)).toBeVisible();
});

test("HR creates a vacancy that appears on the public site, then closes and deletes it", async ({ page }) => {
  await quietVisitor(page);
  const id = tag();
  const title = `Testwell Robotics Teacher ${id}`;
  const slug = `testwell-robotics-teacher-${id}`;
  created.vacancies.push(slug);
  await loginAs(page, "hr");
  await page.goto("/admin/careers/vacancies/new");
  await page.locator("#v-title").fill(title);
  await expect(page.getByLabel("Web address")).toHaveValue(slug);
  await page.getByLabel("Department").fill("Design & Technology");
  await page.getByLabel("Summary").fill("Teach robotics and design to the Middle School (e2e).");
  await page
    .getByLabel("Description")
    .fill("Join the atelier team and teach robotics, electronics and design to girls in Years 7 to 9.");
  await page
    .getByLabel("Requirements")
    .fill("A degree in engineering or design\n- Enthusiasm for making things");
  await page.getByRole("button", { name: "Create vacancy" }).click();

  await expect(page).toHaveURL(/\/admin\/careers\/vacancies$/);
  const row = page.getByTestId(`vacancy-${slug}`);
  await expect(row).toContainText(title);
  await expect(row).toContainText("Live on the website");
  const vacancy = await testDb.vacancy.findUniqueOrThrow({ where: { slug } });
  expect(vacancy.status).toBe("OPEN");
  expect(vacancy.requirements).toEqual(["A degree in engineering or design", "Enthusiasm for making things"]);
  expect(vacancy.closesAt.getTime()).toBeGreaterThan(Date.now());
  expect(await testDb.auditLog.count({ where: { entityId: vacancy.id, action: "vacancy.create" } })).toBe(1);

  // It is on the public vacancies page straight away
  await page.goto(`/careers/vacancies?q=${id}`);
  await expect(page.getByText(title).first()).toBeVisible();

  // A second vacancy can't take the same web address
  await page.goto("/admin/careers/vacancies/new");
  await page.locator("#v-title").fill(title);
  await page.getByLabel("Department").fill("Design & Technology");
  await page.getByLabel("Summary").fill("A duplicate that should be refused (e2e).");
  await page
    .getByLabel("Description")
    .fill("This vacancy repeats an existing web address and must be refused by the server.");
  await page.getByLabel("Requirements").fill("Anything at all");
  await page.getByRole("button", { name: "Create vacancy" }).click();
  await expect(page.getByText(/Another vacancy already uses this web address/)).toBeVisible();

  // Closing takes it off the public site
  await page.goto("/admin/careers/vacancies");
  page.once("dialog", (d) => void d.accept());
  await page
    .getByTestId(`vacancy-${slug}`)
    .getByRole("button", { name: `Close ${title}` })
    .click();
  await expect
    .poll(async () => (await testDb.vacancy.findUniqueOrThrow({ where: { slug } })).status)
    .toBe("CLOSED");
  await page.goto(`/careers/vacancies?q=${id}`);
  await expect(page.getByText(title)).toHaveCount(0);

  // With no applications it can be deleted
  await page.goto("/admin/careers/vacancies");
  await page.getByTestId(`vacancy-${slug}`).getByRole("link", { name: title }).click();
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Delete vacancy" }).click();
  await expect(page).toHaveURL(/\/admin\/careers\/vacancies$/);
  await expect.poll(() => testDb.vacancy.count({ where: { slug } })).toBe(0);
  expect(await testDb.auditLog.count({ where: { entityId: vacancy.id, action: "vacancy.delete" } })).toBe(1);
});

test("a vacancy with applications can be closed but not deleted", async ({ page }) => {
  const seeded = await testDb.vacancy.findUniqueOrThrow({ where: { slug: "teacher-of-mathematics" } });
  await loginAs(page, "hr");
  await page.goto(`/admin/careers/vacancies/${seeded.id}`);
  await expect(page.getByText(/so it can.t be deleted/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete vacancy" })).toHaveCount(0);
  const res = await page.request.delete(`/api/admin/vacancies/${seeded.id}`);
  expect(res.status()).toBe(409);
  expect((await res.json()).error.code).toBe("HAS_APPLICATIONS");
});

test("the JSON API validates, paginates and keeps the application form out of lists", async ({ page }) => {
  await loginAs(page, "hr");
  const bad = await page.request.post("/api/admin/vacancies", { data: { title: "x" } });
  expect(bad.status()).toBe(422);
  expect((await bad.json()).error.code).toBe("VALIDATION_FAILED");

  const list = await page.request.get("/api/admin/staff-applications?size=5&sort=submittedAt&dir=desc");
  expect(list.status()).toBe(200);
  const body = await list.json();
  expect(body.data).toHaveLength(5);
  expect(body.page.total).toBeGreaterThanOrEqual(20);
  expect(body.page.next).toBeTruthy();
  expect(body.data[0]).not.toHaveProperty("data");
  expect(body.data.every((a: { status: string }) => a.status !== "DRAFT")).toBe(true);
  const next = await (
    await page.request.get(`/api/admin/staff-applications?size=5&after=${body.page.next}`)
  ).json();
  expect(next.data[0].id).not.toBe(body.data[0].id);
  const hired = await (await page.request.get("/api/admin/staff-applications?status=HIRED")).json();
  expect(hired.data.length).toBeGreaterThanOrEqual(2);

  const { app } = await makeApplication("SHORTLISTED");
  const one = await (await page.request.get(`/api/admin/staff-applications/${app.id}`)).json();
  expect(one.data.data.personal.fullName).toBe(app.fullName);
  const reject = await page.request.patch(`/api/admin/staff-applications/${app.id}`, {
    data: { status: "REJECTED" },
  });
  expect(reject.status()).toBe(422);
  const hire = await page.request.patch(`/api/admin/staff-applications/${app.id}`, {
    data: { status: "HIRED" },
  });
  expect(hire.status()).toBe(409);
  expect((await hire.json()).error.code).toBe("INVALID_TRANSITION");
  const scored = await page.request.patch(`/api/admin/staff-applications/${app.id}`, {
    data: {
      scorecard: {
        subjectKnowledge: 5,
        teachingAndLearning: 5,
        safeguardingAwareness: 4,
        schoolValues: 4,
        references: 3,
        comment: "API (e2e)",
      },
      note: "Scored through the API (e2e)",
    },
  });
  expect(scored.status()).toBe(200);
  const after = (await scored.json()).data;
  expect(after.score).toBe(21);
  expect(after.notes[0].body).toBe("Scored through the API (e2e)");
});

test("roles are enforced on the server: a teacher is turned away from careers and its API", async ({
  page,
  request,
}) => {
  const anonymous = await request.get("/api/admin/staff-applications");
  expect(anonymous.status()).toBe(401);

  await loginAs(page, "teacher");
  await page.goto("/admin/careers");
  await expect(page).toHaveURL(/\/admin\?denied=careers%3Aread/);
  await expect(page.getByRole("status").filter({ hasText: "isn't available to your role" })).toBeVisible();
  await page.goto("/admin/careers/vacancies");
  await expect(page).toHaveURL(/denied=careers%3Aread/);
  const api = await page.request.get("/api/admin/staff-applications");
  expect(api.status()).toBe(403);
  expect((await api.json()).error.code).toBe("FORBIDDEN");
  const pdf = await page.request.get("/api/admin/staff-applications/anything/pdf");
  expect(pdf.status()).toBe(403);
  const create = await page.request.post("/api/admin/vacancies", { data: {} });
  expect(create.status()).toBe(403);
});

test("the application page flags safeguarding declarations and prints without the CRM shell", async ({
  page,
}) => {
  const flagged = await testDb.staffApplication.findFirstOrThrow({
    where: { data: { path: ["declaration", "pendingAction"], equals: "DECLARE" } },
  });
  await loginAs(page, "hr");
  await page.goto(`/admin/careers/${flagged.id}`);
  const flag = page.getByRole("region", { name: /Safeguarding flag/ });
  await expect(flag).toContainText("Declares pending action");
  await expect(flag).toContainText("speeding fixed penalty notice");

  await expect(page.locator("#crm-root aside")).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#crm-root aside")).toBeHidden();
  await expect(page.getByRole("button", { name: "Print" })).toBeHidden();
  await expect(page.getByRole("heading", { level: 2, name: /^1\. Personal details$/ })).toBeVisible();
});

test("employment gaps are called out on the application", async ({ page }) => {
  const gap = await testDb.staffApplication.findFirstOrThrow({
    where: { ref: { startsWith: "SA-2026-" }, notes: { some: { body: { contains: "career break" } } } },
  });
  await loginAs(page, "hr");
  await page.goto(`/admin/careers/${gap.id}`);
  await expect(page.getByRole("region", { name: /Employment gap/ })).toContainText("7 months");
});

for (const path of [
  "/admin/careers",
  "/admin/careers?view=table",
  "/admin/careers/vacancies",
  "/admin/careers/vacancies/new",
  "/admin/careers/staff",
]) {
  test(`axe: no serious or critical issues on ${path}`, async ({ page }) => {
    await loginAs(page, "hr");
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await axe(page, path);
  });
}

test("axe: no serious or critical issues on an application page", async ({ page }) => {
  const flagged = await testDb.staffApplication.findFirstOrThrow({
    where: { data: { path: ["declaration", "pendingAction"], equals: "DECLARE" } },
  });
  await loginAs(page, "hr");
  await page.goto(`/admin/careers/${flagged.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await axe(page, "application");
});
