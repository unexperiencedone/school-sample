import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { loginAs, quietVisitor } from "./helpers";
import { testDb } from "./db";

test.use({ reducedMotion: "reduce" });

const demoFamily = async () => {
  const parent = await testDb.user.findUniqueOrThrow({ where: { email: "parent@aurelia-sample.test" } });
  const guardian = await testDb.guardian.findUniqueOrThrow({
    where: { userId: parent.id },
    include: { students: { include: { student: true } } },
  });
  const kid = (name: string) => guardian.students.find((s) => s.student.firstName === name)!.student;
  return { parent, guardian, ira: kid("Ira"), anvi: kid("Anvi") };
};

async function axe(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const bad = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  expect(
    bad.map(
      (v) =>
        `${label} ${v.id}: ${v.nodes
          .map((n) => n.target.join(" "))
          .slice(0, 3)
          .join(" | ")}`,
    ),
  ).toEqual([]);
}

test("registrar finds a pupil, opens the medical record (logged); a teacher can't", async ({ page }) => {
  const { ira } = await demoFamily();
  await loginAs(page, "registrar");
  await page.goto(`/admin/students?q=${ira.admissionNo}`);
  await page.getByRole("link", { name: "Ira Menon" }).click();
  await expect(page.getByRole("heading", { name: "Ira Menon" })).toBeVisible();
  await expect(page.getByText("Kavita Menon")).toBeVisible();
  const before = await testDb.auditLog.count({ where: { action: "medical.view", entityId: ira.id } });
  await page.getByRole("link", { name: "Open medical record" }).click();
  await expect(page.getByText("Confidential. Your access has been recorded")).toBeVisible();
  await expect
    .poll(() => testDb.auditLog.count({ where: { action: "medical.view", entityId: ira.id } }))
    .toBe(before + 1);

  await loginAs(page, "teacher");
  await page.goto(`/admin/students/${ira.id}`);
  await expect(page.getByText(/Restricted to the Registrar/)).toBeVisible();
  await page.goto(`/admin/students/${ira.id}/medical`);
  await expect(page).toHaveURL(/denied=students%3Amedical/);
});

test("withdrawal takes a pupil off the roll with a reason; promotion is previewed before anything moves", async ({
  page,
}) => {
  const pupil = await testDb.student.findFirstOrThrow({
    where: { status: "ACTIVE", lastName: { not: "Menon" }, class: { code: "Y6" } },
    orderBy: { admissionNo: "desc" },
  });
  await loginAs(page, "registrar");
  await page.goto(`/admin/students/${pupil.id}`);
  const form = page.locator("form").filter({ hasText: "Last day" });
  await form.getByLabel("Last day").fill("2026-12-18");
  await form.getByLabel("Going to (optional)").fill("Sample School, Bengaluru");
  await form.getByLabel("Reason").fill("Family relocating for work (e2e)");
  page.once("dialog", (d) => void d.accept());
  await form.getByRole("button", { name: "Record" }).click();
  await expect
    .poll(async () => (await testDb.student.findUniqueOrThrow({ where: { id: pupil.id } })).status)
    .toBe("WITHDRAWN");
  expect(
    await testDb.auditLog.count({
      where: { entityId: pupil.id, action: "student.withdraw", reason: "Family relocating for work (e2e)" },
    }),
  ).toBe(1);

  await page.goto("/admin/students/promotion");
  await expect(page.getByText("Move up")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Alumna" }).first()).toBeVisible();
  const placed = await testDb.studentClassHistory.count({ where: { year: { name: "2027-28" } } });
  expect(placed).toBe(0); // the preview changed nothing
});

test("parent: switch to the child with fees due and pay online; the receipt appears", async ({ page }) => {
  test.setTimeout(150_000);
  const { anvi } = await demoFamily();
  await quietVisitor(page);
  await loginAs(page, "parent");
  await expect(page).toHaveURL(/\/portal/);
  await page.getByLabel("Viewing").selectOption(anvi.id);
  await expect(page.getByRole("heading", { name: "Anvi Menon" })).toBeVisible();
  await expect(page.getByText(/Next due/)).toBeVisible();
  await page.getByRole("button", { name: /^Pay ₹/ }).click();
  await expect(page).toHaveURL(/\/mock-pay\//);
  await page.getByTestId("mock-succeed").click();
  await expect(page.getByRole("heading", { name: "Payment received" })).toBeVisible();
  await page.getByRole("link", { name: "Continue" }).click();
  // First visit to the portal fees page compiles it under `next dev`
  await expect(page).toHaveURL(/\/portal\/fees/, { timeout: 60_000 });
  const second = await testDb.instalment.findFirstOrThrow({
    where: { invoice: { studentId: anvi.id, year: { isCurrent: true } }, seq: 2 },
  });
  expect(second.status).toBe("PAID");
  const receipt = await testDb.receipt.findFirstOrThrow({
    where: { payment: { studentId: anvi.id } },
    orderBy: { issuedAt: "desc" },
  });
  await page.goto(`/portal/fees?child=${anvi.id}`);
  await expect(page.getByRole("link", { name: receipt.number })).toBeVisible();
});

test("parent tops up pocket money; staff see it on the ledger", async ({ page }) => {
  test.setTimeout(150_000);
  const { ira } = await demoFamily();
  const sum = async () => {
    const rows = await testDb.imprestEntry.findMany({ where: { studentId: ira.id } });
    return rows.reduce((a, r) => a + (r.kind === "CREDIT" ? r.amountPaise : -r.amountPaise), 0);
  };
  const before = await sum();
  await quietVisitor(page);
  await loginAs(page, "parent");
  await page.goto(`/portal/pocket-money?child=${ira.id}`);
  await page.getByRole("radio", { name: "₹1,000" }).click();
  await page.getByRole("button", { name: "Top up" }).click();
  await page.getByTestId("mock-succeed").click();
  await expect(page.getByRole("heading", { name: "Payment received" })).toBeVisible();
  await expect.poll(sum).toBe(before + 100_000);

  await loginAs(page, "houseparent");
  await page.goto(`/admin/imprest/${ira.id}`);
  await expect(page.getByText(/Online top-up/).first()).toBeVisible();
  // Overspending is refused with a plain explanation
  await page.getByLabel("Amount (₹)").fill("999999");
  await page.getByLabel("Description").fill("Impossible purchase (e2e)");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(/Only ₹.* is left|more than ₹50,000/)).toBeVisible();
});

test("portal requests reach the office and the reply comes back; consent changes are recorded", async ({
  page,
}) => {
  const { ira, guardian } = await demoFamily();
  await loginAs(page, "parent");
  await page.goto(`/portal/requests?child=${ira.id}`);
  await page.getByLabel("New mobile number").fill("+91 90000 12345");
  await page.getByLabel("Anything else").fill("Please update the WhatsApp number too (e2e)");
  await page.getByRole("button", { name: "Send to the school" }).click();
  await expect(page.getByText(/Request sent/)).toBeVisible();
  const req = await testDb.portalRequest.findFirstOrThrow({
    where: { studentId: ira.id, kind: "PROFILE_UPDATE" },
    orderBy: { createdAt: "desc" },
  });

  await loginAs(page, "registrar");
  await page.goto("/admin/students/requests");
  const target = page.locator(`[data-request="${req.id}"]`);
  await expect(target.getByText("Please update the WhatsApp number too (e2e)")).toBeVisible();
  await target.getByLabel("Status").selectOption("APPROVED");
  await target.getByLabel("Reply to the family").fill("Updated — thank you (e2e)");
  await target.getByRole("button", { name: "Save reply" }).click();
  await expect
    .poll(async () => (await testDb.portalRequest.findUniqueOrThrow({ where: { id: req.id } })).status)
    .toBe("APPROVED");

  await loginAs(page, "parent");
  await page.goto(`/portal/requests?child=${ira.id}`);
  await expect(page.getByText("School: Updated — thank you (e2e)")).toBeVisible();

  await page.goto("/portal/profile");
  await page.getByLabel("WhatsApp").uncheck();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect
    .poll(async () => (await testDb.guardian.findUniqueOrThrow({ where: { id: guardian.id } })).whatsappOptIn)
    .toBe(false);
  expect(
    await testDb.auditLog.count({ where: { action: "consent.update", entityId: guardian.id } }),
  ).toBeGreaterThan(0);
});

test("a parent only ever sees their own children", async ({ page }) => {
  const other = await testDb.student.findFirstOrThrow({
    where: { status: "ACTIVE", lastName: { not: "Menon" } },
    include: { invoices: true },
  });
  await loginAs(page, "parent");
  const res = await page.goto(`/portal?child=${other.id}`);
  expect(res?.status()).toBe(404);
  const pdf = await page.request.get(`/api/invoices/${other.invoices[0]!.id}/pdf`);
  expect(pdf.status()).toBe(403);
  const topup = await page.request.post("/api/payments/imprest-topup", {
    data: { studentId: other.id, amountPaise: 100_000, idempotencyKey: "e2e-other-child" },
  });
  expect(topup.status()).toBe(404);
});

test("content: a notice goes live on the website; a circular reaches Year 4 families", async ({ page }) => {
  const title = `E2E notice ${Date.now() % 100000}`;
  await loginAs(page, "principal");
  await page.goto("/admin/content");
  const add = page.locator("form").filter({ hasText: "Add" }).last();
  await add.getByLabel("Title").fill(title);
  await add.getByLabel("Message (≤ 160 characters)").fill("Admissions for 2027-28 are open (e2e)");
  await add.getByLabel(/Link/).fill("/admissions");
  await add.getByLabel("Order").fill("0");
  await add.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Added to the announcement bar")).toBeVisible();
  await quietVisitor(page);
  await page.goto("/");
  // The bar rotates one notice at a time; the newest notice with the lowest order shows first
  await expect(page.getByText(title)).toBeVisible();

  const y4 = await testDb.classLevel.findUniqueOrThrow({ where: { code: "Y4" } });
  const families = await testDb.guardian.count({
    where: { students: { some: { isPrimary: true, student: { status: "ACTIVE", classId: y4.id } } } },
  });
  await page.goto("/admin/comms");
  await page.getByLabel("Title").fill("Year 4 trip to the planetarium (e2e)");
  await page
    .getByLabel("Letter")
    .fill("Dear parents,\n\nYear 4 will visit the planetarium on Friday. Please send a packed lunch.");
  await page.locator("select[name=audience]").selectOption(`CLASS:${y4.id}`);
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Publish and send" }).click();
  await expect(page.getByText(new RegExp(`sent to ${families} families`))).toBeVisible();
  await loginAs(page, "parent");
  await page.goto("/portal/circulars");
  await expect(page.getByRole("heading", { name: "Year 4 trip to the planetarium (e2e)" })).toBeVisible();
});

test("axe: portal, students and academics pages (light and dark CRM)", async ({ page }) => {
  test.setTimeout(240_000);
  const { ira } = await demoFamily();
  await loginAs(page, "parent");
  for (const path of [
    "/portal",
    "/portal/fees",
    "/portal/pocket-money",
    "/portal/requests",
    "/portal/profile",
  ]) {
    await page.goto(`${path}?child=${ira.id}`);
    await axe(page, path);
  }
  await loginAs(page, "principal");
  for (const path of [
    "/admin/students",
    `/admin/students/${ira.id}`,
    "/admin/academics",
    "/admin/academics/timetable",
    "/admin/imprest",
    "/admin/content/events",
    "/admin/comms",
  ]) {
    await page.goto(path);
    for (const theme of ["light", "dark"]) {
      await page.evaluate((t) => document.getElementById("crm-root")?.setAttribute("data-theme", t), theme);
      await axe(page, `${path} ${theme}`);
    }
  }
});
