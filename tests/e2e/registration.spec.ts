import path from "node:path";
import { expect, test } from "@playwright/test";
import { quietVisitor, uniqueEmail } from "./helpers";
import { testDb } from "./db";

test.use({ reducedMotion: "reduce" });
test.beforeEach(async ({ page }) => quietVisitor(page));

test("online registration → mock gateway → REGISTERED with receipt and sign-in link", async ({ page }) => {
  const email = uniqueEmail("reg");
  await page.goto("/admissions/register");

  // 1. Child
  await page.getByLabel("First name").fill("Ira");
  await page.getByLabel("Last name").fill("Testwal");
  await page.getByLabel("Day").selectOption("3");
  await page.getByLabel("Month").selectOption("9");
  await page.getByLabel("Year", { exact: true }).selectOption(String(new Date().getFullYear() - 11));
  await page.getByLabel("Class applying for").selectOption({ label: "Year 7" });
  await page.getByRole("button", { name: "Save and continue" }).click();

  // 2. Parents
  await expect(page.getByRole("heading", { name: /Step 2 of 6/ })).toBeVisible();
  await page.locator("#g0-name").fill("Nandita Testwal");
  await page.locator("#g0-phone").fill("+91 98100 00000");
  await page.locator("#g0-email").fill(email);
  await page.locator("#g0-address").fill("12 Placeholder Lane, Sample City 000000");
  await page
    .getByLabel(/^Email/)
    .last()
    .fill(email);
  await page.locator("#contactPhone").fill("+91 98100 00000");
  await page.getByRole("button", { name: "Save and continue" }).click();

  // 3. Boarding (full boarding is offered for Year 7)
  await expect(page.getByRole("heading", { name: /Step 3 of 6/ })).toBeVisible();
  await page.getByText("Full boarding", { exact: true }).click();
  await page.getByRole("button", { name: "Save and continue" }).click();

  // 4. Documents: real signed upload through the storage adapter
  await expect(page.getByRole("heading", { name: /Step 4 of 6/ })).toBeVisible();
  await page
    .locator("#doc-BIRTH_CERTIFICATE")
    .setInputFiles(path.join(__dirname, "fixtures/birth-certificate.pdf"));
  await expect(page.getByLabel("Uploaded")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // 5. Review → pay
  await expect(page.getByRole("heading", { name: /Step 5 of 6/ })).toBeVisible();
  await page.getByRole("button", { name: /Proceed to payment/ }).click();
  await expect(page.getByText("Please tick both boxes")).toBeVisible();
  await page.getByLabel(/I confirm the information is accurate/).check();
  await page.getByLabel(/I give parental consent/).check();
  await page.getByRole("button", { name: /Proceed to payment/ }).click();

  // 6. Mock gateway
  await expect(page).toHaveURL(/\/mock-pay\//);
  await expect(page.getByText("₹10,000.00")).toBeVisible();
  await page.getByTestId("mock-succeed").click();
  await expect(page.getByRole("heading", { name: "Payment received" })).toBeVisible();
  await page.getByRole("link", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Registration complete" })).toBeVisible();

  const app = await testDb.application.findFirstOrThrow({
    where: { contactEmail: email },
    include: { documents: true },
  });
  expect(app.stage).toBe("REGISTERED");
  expect(app.boardingType).toBe("FULL");
  expect(app.documents.find((d) => d.kind === "BIRTH_CERTIFICATE")?.fileKey).toBeTruthy();
  const user = await testDb.user.findUniqueOrThrow({ where: { email } });
  expect(user.role).toBe("APPLICANT");
  const outbox = await testDb.outbox.findMany({ where: { to: email } });
  expect(outbox.map((o) => o.template)).toContain("registration-receipt");
  const payments = await testDb.payment.findMany({
    where: { applicationId: app.id },
    include: { receipt: true },
  });
  expect(payments).toHaveLength(1);
  expect(payments[0]!.receipt?.number).toMatch(/^AHR\/\d{4}-\d{2}\/\d{6}$/);
});

test("duplicate webhook delivery never double-credits", async ({ page }) => {
  const email = uniqueEmail("dup");
  const child = {
    childFirstName: "Dup",
    childLastName: "Check",
    dobDay: "1",
    dobMonth: "1",
    dobYear: String(new Date().getFullYear() - 9),
    gender: "FEMALE",
    currentSchool: "",
    classId: "",
    startYearId: "",
  };
  const cls = await testDb.classLevel.findUniqueOrThrow({ where: { code: "Y4" } });
  const year = await testDb.academicYear.findUniqueOrThrow({ where: { name: "2027-28" } });
  const r = await page.request.post("/api/registration", {
    data: { child: { ...child, classId: cls.id, startYearId: year.id } },
  });
  const { id, draftToken } = await r.json();
  const guardians = [
    {
      relation: "Mother",
      name: "Dup Parent",
      phone: "+91 98100 00001",
      email,
      address: "1 Sample Road, City 000000",
    },
    { relation: "Father", name: "" },
    { relation: "Guardian", name: "" },
  ];
  await page.request.patch("/api/registration", {
    headers: { "x-draft-token": draftToken },
    data: {
      id,
      parents: { guardians, contactEmail: email, contactPhone: "+91 98100 00001" },
      boarding: { boardingType: "DAY" },
    },
  });
  const pay = await page.request.post(`/api/registration/${id}/pay`, {
    headers: { "x-draft-token": draftToken },
    data: { declaration: true, dataConsent: true },
  });
  expect(pay.status()).toBe(201);
  const { checkout } = await pay.json();
  // Same request again → same order (idempotent)
  const again = await (
    await page.request.post(`/api/registration/${id}/pay`, {
      headers: { "x-draft-token": draftToken },
      data: { declaration: true, dataConsent: true },
    })
  ).json();
  expect(again.orderId).toBeTruthy();

  await page.goto(checkout.url);
  await page.getByTestId("mock-duplicate").click();
  await expect(page.getByRole("heading", { name: "Payment received" })).toBeVisible();

  const payments = await testDb.payment.findMany({ where: { applicationId: id } });
  expect(payments).toHaveLength(1);
  const order = await testDb.paymentOrder.findFirstOrThrow({ where: { applicationId: id } });
  const events = await testDb.webhookEvent.findMany({
    where: { payload: { path: ["payload", "payment", "order_id"], equals: order.providerOrderId } },
  });
  expect(events).toHaveLength(1); // second delivery rejected by the (provider, eventId) unique key
  expect(await testDb.paymentOrder.count({ where: { applicationId: id } })).toBe(1);
});

test("registration API rejects access without the draft token", async ({ request }) => {
  const res = await request.patch("/api/registration", {
    data: { id: "nope", boarding: { boardingType: "DAY" } },
  });
  expect([401, 404]).toContain(res.status());
});
