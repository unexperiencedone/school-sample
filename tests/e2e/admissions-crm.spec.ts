import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fillEnquiry, loginAs, quietVisitor, uniqueEmail } from "./helpers";
import { testDb } from "./db";

test.use({ reducedMotion: "reduce" });

/** Creates a registered (fee-paid) application through the public API and mock gateway; returns its id. */
async function registerApplication(page: Page, email: string, childFirstName: string) {
  const cls = await testDb.classLevel.findUniqueOrThrow({ where: { code: "Y7" } });
  const year = await testDb.academicYear.findUniqueOrThrow({ where: { name: "2027-28" } });
  const r = await page.request.post("/api/registration", {
    data: {
      child: {
        childFirstName,
        childLastName: "Flowtest",
        dobDay: "12",
        dobMonth: "5",
        dobYear: String(new Date().getFullYear() - 11),
        gender: "FEMALE",
        currentSchool: "Sample Primary",
        classId: cls.id,
        startYearId: year.id,
      },
    },
  });
  expect(r.status()).toBe(201);
  const { id, draftToken } = await r.json();
  await page.request.patch("/api/registration", {
    headers: { "x-draft-token": draftToken },
    data: {
      id,
      parents: {
        guardians: [
          {
            relation: "Mother",
            name: "Kirti Flowtest",
            phone: "+91 98100 00002",
            email,
            address: "2 Sample Road, City 000000",
          },
          { relation: "Father", name: "" },
          { relation: "Guardian", name: "" },
        ],
        contactEmail: email,
        contactPhone: "+91 98100 00002",
      },
      boarding: { boardingType: "DAY" },
    },
  });
  const pay = await page.request.post(`/api/registration/${id}/pay`, {
    headers: { "x-draft-token": draftToken },
    data: { declaration: true, dataConsent: true },
  });
  expect(pay.status()).toBe(201);
  const { checkout } = await pay.json();
  await page.goto(checkout.url);
  await page.getByTestId("mock-succeed").click();
  await expect(page.getByRole("heading", { name: "Payment received" })).toBeVisible();
  return id as string;
}

const stageOf = async (id: string) => (await testDb.application.findUniqueOrThrow({ where: { id } })).stage;

/** Opens a stage action, confirms it, and waits until the page has re-rendered with the new stage. */
async function moveTo(page: Page, id: string, action: string, stage: string, label: string) {
  await page.getByRole("button", { name: action, exact: true }).click();
  await page.getByRole("button", { name: `Confirm: ${action}` }).click();
  await expect.poll(() => stageOf(id)).toBe(stage);
  await expect(page.getByText(`Currently: ${label}`)).toBeVisible();
}

test("a website enquiry lands in the CRM inbox and can be worked", async ({ page }) => {
  await quietVisitor(page);
  const email = uniqueEmail("crm");
  await page.goto("/contact");
  const form = page.getByRole("tabpanel");
  await fillEnquiry(page, form, { email, parentName: "Rekha Inboxtest" });
  await form.getByRole("button", { name: "Send enquiry" }).click();
  await expect(form.getByText("Thank you — we'll be in touch")).toBeVisible();

  await loginAs(page, "admissions");
  await page.goto(`/admin/leads?q=${encodeURIComponent(email)}`);
  const row = page.getByRole("link", { name: "Rekha Inboxtest" });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByRole("heading", { name: "Rekha Inboxtest" })).toBeVisible();
  await expect(page.getByText("Contact page", { exact: true })).toBeVisible();

  await page.getByLabel("Status").selectOption("CONTACTED");
  await expect(page.getByText("Status updated")).toBeVisible();
  await page.getByPlaceholder("Log a call, email or note…").fill("Spoke to the mother; tour next week.");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Spoke to the mother; tour next week.")).toBeVisible();

  const lead = await testDb.lead.findFirstOrThrow({ where: { email }, include: { activities: true } });
  expect(lead.status).toBe("CONTACTED");
  expect(lead.activities.map((a) => a.kind)).toEqual(expect.arrayContaining(["CREATED", "NOTE"]));
  expect(await testDb.outbox.count({ where: { to: email, template: "enquiry-received" } })).toBe(1);
});

test("admissions journey: registered → offer → family accepts and pays → admitted", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await quietVisitor(page);
  const email = uniqueEmail("journey");
  const id = await registerApplication(page, email, "Juhi");

  // Staff walk the pipeline
  const staff = await (await browser.newContext()).newPage();
  await loginAs(staff, "admissions");
  await staff.goto(`/admin/applications/${id}`);
  await expect(staff.getByRole("heading", { name: "Juhi Flowtest" })).toBeVisible();
  await moveTo(staff, id, "Start document check", "DOCUMENTS", "Document check");
  await moveTo(staff, id, "Move to assessment", "ASSESSMENT", "Assessment");
  await moveTo(staff, id, "Send to review", "REVIEW", "Review");
  await staff.getByRole("button", { name: "Make an offer", exact: true }).click();
  await expect(staff.getByText(/First-year invoice preview/)).toBeVisible();
  await staff.getByRole("button", { name: "Confirm: Make an offer" }).click();
  await expect.poll(() => stageOf(id)).toBe("OFFER");
  const offerMail = await testDb.outbox.findFirst({ where: { to: email, template: "offer-letter" } });
  expect(offerMail).not.toBeNull();

  // The family signs in with an emailed link (read from the mock outbox) and accepts by paying
  await page.goto("/login");
  await page.getByRole("tab", { name: "Email me a link" }).click();
  await page.locator("#ml-email").fill(email);
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  await expect(page.getByText(/a sign-in link is on its way/)).toBeVisible();
  const link = await testDb.outbox.findFirstOrThrow({
    where: { to: email, template: "magic-link" },
    orderBy: { createdAt: "desc" },
  });
  const url = (link.payload as { data: { url: string } }).data.url;
  await page.goto(url);
  await expect(page).toHaveURL(/\/applicant/);
  await expect(page.getByText(/We'd love to welcome Juhi/)).toBeVisible();
  await page.getByRole("button", { name: "Accept and pay" }).click();
  await expect(page).toHaveURL(/\/mock-pay\//);
  await page.getByTestId("mock-succeed").click();
  await expect(page.getByRole("heading", { name: "Payment received" })).toBeVisible();
  await expect.poll(() => stageOf(id)).toBe("FEE_PAID");

  // Staff admit: admission number, section and a parent account
  await staff.reload();
  await moveTo(staff, id, "Admit", "ADMITTED", "Admitted");
  const student = await testDb.student.findUniqueOrThrow({ where: { applicationId: id } });
  expect(student.status).toBe("ACTIVE");
  expect(student.admissionNo).toMatch(/^AH\d{2}\d{4}$/);
  expect(student.sectionId).toBeTruthy();
  expect((await testDb.user.findUniqueOrThrow({ where: { email } })).role).toBe("PARENT");
  const events = await testDb.applicationEvent.findMany({
    where: { applicationId: id },
    orderBy: { createdAt: "asc" },
  });
  expect(events.map((e) => e.toStage)).toEqual([
    "DRAFT",
    "REGISTERED",
    "DOCUMENTS",
    "ASSESSMENT",
    "REVIEW",
    "OFFER",
    "FEE_PAID",
    "ADMITTED",
  ]);
});

test("roles are enforced on the server: a teacher is turned away from the pipeline", async ({ page }) => {
  await loginAs(page, "teacher");
  await page.goto("/admin/applications");
  await expect(page).toHaveURL(/\/admin\?denied=applications%3Aread/);
  await expect(page.getByRole("status").filter({ hasText: "isn't available to your role" })).toBeVisible();
});

test("tour check-in from the tours screen", async ({ page }) => {
  await quietVisitor(page);
  const email = uniqueEmail("tourci");
  await page.goto("/contact?tab=tour");
  const panel = page.getByRole("tabpanel");
  // A name no earlier run has used, so the tours list row is unambiguous
  const parentName = `Tanvi ${Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("")}`;
  await fillEnquiry(page, panel, { email, parentName });
  const d = new Date(Date.now() + 2 * 86400_000);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  await panel.getByLabel("Preferred date").fill(d.toISOString().slice(0, 10));
  await panel.getByLabel("Preferred time").selectOption("14:30");
  await panel.getByRole("button", { name: "Book my visit" }).click();
  await expect(panel.getByText("Your visit is booked")).toBeVisible();

  await loginAs(page, "admissions");
  await page.goto("/admin/tours");
  const booking = page.getByRole("listitem").filter({ hasText: parentName });
  await booking.getByRole("button", { name: "Check in" }).click();
  await expect(booking.getByText("Checked in")).toBeVisible();
  await expect
    .poll(async () => (await testDb.tourBooking.findFirstOrThrow({ where: { lead: { email } } })).status)
    .toBe("CHECKED_IN");
  expect((await testDb.lead.findFirstOrThrow({ where: { email } })).status).toBe("TOUR_DONE");
});

test("role dashboards: numbers, a chart with its table twin, and today's queues", async ({ page }) => {
  await loginAs(page, "principal");
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Helena/ })).toBeVisible();
  await expect(page.getByText("New enquiries, last 7 days")).toBeVisible();
  await expect(page.getByText("Overdue", { exact: true })).toBeVisible();
  const stages = page.getByRole("figure", { name: "Applications by stage" });
  await expect(stages.getByRole("list", { name: "Applications by stage" }).getByRole("link")).toHaveCount(7);
  await stages.getByRole("button", { name: "Table" }).click();
  await expect(stages.getByRole("table")).toBeVisible();
  await expect(stages.getByRole("cell", { name: "Offer made" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();

  await loginAs(page, "accounts");
  await expect(page.getByText("Collected, last 30 days")).toBeVisible();
  await expect(page.getByRole("figure", { name: "Collections by month" })).toBeVisible();
  await expect(page.getByText("New enquiries, last 7 days")).toHaveCount(0);

  await loginAs(page, "teacher");
  await expect(page.getByRole("heading", { name: /Your lessons/ })).toBeVisible();
});

for (const [role, path] of [
  ["principal", "/admin"],
  ["admissions", "/admin/leads"],
  ["admissions", "/admin/applications"],
  ["admissions", "/admin/tours"],
] as const) {
  test(`axe: no serious or critical issues on ${path} (${role})`, async ({ page }) => {
    await loginAs(page, role);
    await page.goto(path);
    for (const theme of ["light", "dark"]) {
      await page.evaluate((t) => document.getElementById("crm-root")?.setAttribute("data-theme", t), theme);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      const bad = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
      expect(
        bad.map(
          (v) =>
            `${theme} ${v.id}: ${v.nodes
              .map((n) => n.target.join(" "))
              .slice(0, 3)
              .join(" | ")}`,
        ),
      ).toEqual([]);
    }
  });
}
