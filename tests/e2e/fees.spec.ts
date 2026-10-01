import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { loginAs } from "./helpers";
import { testDb } from "./db";

test.use({ reducedMotion: "reduce" });

const currentYear = () => testDb.academicYear.findFirstOrThrow({ where: { isCurrent: true } });

/** Answers the next window.prompt/confirm with `text`. */
const answerNextDialog = (page: Page, text = "Checked and agreed (e2e)") =>
  page.once("dialog", (d) => void d.accept(text));

test("fee revision: draft, see the impact on open invoices, publish and reprice", async ({ page }) => {
  test.setTimeout(180_000);
  const year = await currentYear();
  const active = await testDb.feeStructure.findFirstOrThrow({
    where: { yearId: year.id, band: "SIXTH_FORM", boardingType: "DAY", status: "ACTIVE" },
  });
  // Clear any draft a previous run left behind
  await testDb.feeStructure.deleteMany({
    where: { yearId: year.id, band: "SIXTH_FORM", boardingType: "DAY", status: "DRAFT" },
  });
  const openBefore = await testDb.invoice.findMany({
    where: { structureId: active.id, status: { in: ["OPEN", "PARTIAL", "OVERDUE"] } },
    select: { id: true, totalPaise: true },
  });

  await loginAs(page, "accounts");
  await page.goto(`/admin/fees/structures/${active.id}?revise=1`);
  await page.getByLabel("Percentage change").fill("5");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.getByLabel(/Reason \(recorded/).fill("Annual revision of 5% approved by the Board (e2e)");
  await page.getByRole("button", { name: "Save draft and preview impact" }).click();

  await expect(page.getByRole("heading", { name: /Impact of publishing v\d+/ })).toBeVisible();
  await expect(page.getByText("Open invoices repriced")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Tuition" }).first()).toBeVisible();
  const draft = await testDb.feeStructure.findFirstOrThrow({
    where: { yearId: year.id, band: "SIXTH_FORM", boardingType: "DAY", status: "DRAFT" },
    include: { lines: { include: { feeHead: true } } },
  });
  const tuitionWas = (
    await testDb.feeStructureLine.findFirstOrThrow({
      where: { structureId: active.id, feeHead: { code: "TUI" } },
    })
  ).amountPaise;
  expect(draft.lines.find((l) => l.feeHead.code === "TUI")!.amountPaise).toBe(
    Math.round((tuitionWas * 1.05) / 100) * 100,
  );

  await page.getByLabel("Approval note").fill("Board minute 14, 28 Sep (e2e)");
  await page.getByRole("button", { name: "Publish revision" }).click();
  await expect(page).toHaveURL(/\/admin\/fees$/);

  await expect
    .poll(async () => (await testDb.feeStructure.findUniqueOrThrow({ where: { id: draft.id } })).status)
    .toBe("ACTIVE");
  expect((await testDb.feeStructure.findUniqueOrThrow({ where: { id: active.id } })).status).toBe(
    "SUPERSEDED",
  );
  for (const inv of openBefore) {
    const after = await testDb.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(after.structureId).toBe(draft.id);
    expect(after.totalPaise).toBeGreaterThan(inv.totalPaise);
  }
  const audits = await testDb.auditLog.findMany({ where: { entity: "FeeStructure", entityId: draft.id } });
  expect(audits.map((a) => a.action)).toEqual(
    expect.arrayContaining(["fee_structure.draft", "fee_structure.publish"]),
  );
});

test("offline payment: allocation preview, receipt issued, receipt PDF downloads", async ({ page }) => {
  const inst = await testDb.instalment.findFirstOrThrow({
    where: {
      status: "OVERDUE",
      invoice: { status: "OVERDUE", student: { status: "ACTIVE" } },
      lateFeeWaived: false,
    },
    include: { invoice: true },
    orderBy: { dueDate: "asc" },
  });
  await loginAs(page, "accounts");
  await page.goto(`/admin/payments/new?student=${inst.invoice.studentId}&instalment=${inst.id}`);
  await expect(page.getByText("This payment will be applied to")).toBeVisible();
  await page.getByLabel("Amount received (₹)").fill("10000");
  await page.getByLabel(/UTR \/ bank reference/).fill(`NEFTE2E${Date.now() % 100000}`);
  await page.getByRole("button", { name: "Record payment and issue receipt" }).click();
  const receiptLink = page.getByRole("link", { name: "Open receipt (PDF)" });
  await expect(receiptLink).toBeVisible();
  const href = await receiptLink.getAttribute("href");
  const pdf = await page.request.get(href!);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  const after = await testDb.instalment.findUniqueOrThrow({ where: { id: inst.id } });
  expect(after.paidPaise).toBe(inst.paidPaise + 1_000_000);
});

test("refunds need two people: Accounts requests, the Principal approves, Accounts pays out", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  const payment = await testDb.payment.findFirstOrThrow({
    where: {
      provider: "mock",
      status: "CAPTURED",
      studentId: { not: null },
      refunds: { none: {} },
      amountPaise: { gt: 500_000 },
    },
    orderBy: { receivedAt: "desc" },
  });
  await loginAs(page, "accounts");
  await page.goto(`/admin/payments/refunds/new?payment=${payment.id}`);
  await page.getByLabel("Amount (₹)").fill("2500");
  await page.getByLabel("Reason").fill("Duplicate charge for a cancelled trip (e2e)");
  await page.getByRole("button", { name: "Request approval" }).click();
  await expect(page).toHaveURL(/refunds\?status=REQUESTED/);
  const refund = await testDb.refund.findFirstOrThrow({ where: { paymentId: payment.id } });
  expect(refund.status).toBe("REQUESTED");

  const principal = await (await browser.newContext()).newPage();
  await loginAs(principal, "principal");
  await principal.goto("/admin/payments/refunds?status=REQUESTED");
  const row = principal
    .getByRole("row")
    .filter({ hasText: "Duplicate charge for a cancelled trip (e2e)" })
    .first();
  answerNextDialog(principal, "Approved (e2e)");
  await row.getByRole("button", { name: "Approve" }).click();
  await expect
    .poll(async () => (await testDb.refund.findUniqueOrThrow({ where: { id: refund.id } })).status)
    .toBe("APPROVED");

  await page.goto("/admin/payments/refunds?status=APPROVED");
  await page
    .getByRole("row")
    .filter({ hasText: "Duplicate charge for a cancelled trip (e2e)" })
    .first()
    .getByRole("button", { name: "Refund via gateway" })
    .click();
  await expect
    .poll(async () => (await testDb.refund.findUniqueOrThrow({ where: { id: refund.id } })).status)
    .toBe("PROCESSED");
  const p = await testDb.payment.findUniqueOrThrow({ where: { id: payment.id } });
  expect(p.refundedPaise).toBe(250_000);
  expect(p.status).toBe("PARTIALLY_REFUNDED");
  // Accounts has no approval permission at all
  expect(
    await testDb.auditLog.count({
      where: { entityId: refund.id, action: "refund.approve", actorRole: "PRINCIPAL" },
    }),
  ).toBe(1);
});

test("an approved scholarship reprices the pupil's open invoice", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const year = await currentYear();
  const scholarship = await testDb.concession.findUniqueOrThrow({ where: { code: "SCH-SPEC" } });
  const invoice = await testDb.invoice.findFirstOrThrow({
    where: {
      yearId: year.id,
      status: { in: ["OPEN", "PARTIAL"] },
      student: { status: "ACTIVE", concessions: { none: {} }, isStaffWard: false },
      discountPaise: 0,
    },
    include: { student: true },
  });
  await loginAs(page, "accounts");
  await page.goto("/admin/fees/concessions");
  await page.getByLabel("Pupil").selectOption(invoice.studentId);
  await page.getByLabel("Concession").selectOption(scholarship.id);
  await page.getByLabel("Reason").fill("Specialist music scholarship after audition (e2e)");
  await page.getByRole("button", { name: "Send for approval" }).click();
  await expect(page.getByText("Request sent for approval")).toBeVisible();

  const principal = await (await browser.newContext()).newPage();
  await loginAs(principal, "principal");
  await principal.goto("/admin/fees/concessions");
  const row = principal
    .getByRole("row")
    .filter({ hasText: `${invoice.student.firstName} ${invoice.student.lastName}` })
    .first();
  answerNextDialog(principal, "Audition panel recommendation (e2e)");
  await row.getByRole("button", { name: "Approve" }).click();
  await expect
    .poll(async () => (await testDb.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).discountPaise)
    .toBeGreaterThan(0);
  const after = await testDb.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  expect(after.totalPaise).toBeLessThan(invoice.totalPaise);
  expect(
    await testDb.auditLog.count({
      where: { entity: "Invoice", entityId: invoice.id, action: "invoice.reprice" },
    }),
  ).toBeGreaterThan(0);
});

test("bank reconciliation: import a statement, auto-match, set aside a non-fee credit", async ({ page }) => {
  await loginAs(page, "accounts");
  const csv = await (await page.request.get("/api/admin/reconciliation/sample")).text();
  expect(csv).toContain("Txn Date,Narration");
  await page.goto("/admin/payments/reconciliation");
  await page
    .getByLabel("Bank statement (.csv)")
    .setInputFiles({ name: "e2e-statement.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Import and match" }).click();
  await expect(page.getByText(/credits imported, \d+ matched automatically/)).toBeVisible();
  const imp = await testDb.bankStatementImport.findFirstOrThrow({
    orderBy: { createdAt: "desc" },
    include: { lines: true },
  });
  const matched = imp.lines.filter((l) => l.matchStatus === "MATCHED");
  expect(matched.length).toBeGreaterThan(0);
  const stray = imp.lines.find((l) => l.reference === "IMPS629104")!;
  expect(stray.matchStatus).toBe("UNMATCHED");
  await page.reload();
  await page
    .getByRole("row")
    .filter({ hasText: "IMPS629104" })
    .getByRole("button", { name: "Not a fee" })
    .click();
  await expect
    .poll(
      async () => (await testDb.bankStatementLine.findUniqueOrThrow({ where: { id: stray.id } })).matchStatus,
    )
    .toBe("IGNORED");
});

test("late fee waiver is permissioned and leaves a reason on the record", async ({ page }) => {
  const inst = await testDb.instalment.findFirstOrThrow({
    where: { lateFeePaise: { gt: 0 }, lateFeeWaived: false, status: { in: ["OVERDUE", "PARTIAL"] } },
  });
  await loginAs(page, "accounts");
  await page.goto(`/admin/fees/invoices/${inst.invoiceId}`);
  answerNextDialog(page, "Bank holiday delayed the transfer (e2e)");
  await page.getByRole("row").filter({ hasText: inst.label }).getByRole("button", { name: "Waive" }).click();
  await expect
    .poll(async () => (await testDb.instalment.findUniqueOrThrow({ where: { id: inst.id } })).lateFeeWaived)
    .toBe(true);
  const a = await testDb.auditLog.findFirstOrThrow({
    where: { entityId: inst.id, action: "late_fee.waive" },
  });
  expect(a.reason).toBe("Bank holiday delayed the transfer (e2e)");

  await loginAs(page, "teacher");
  const res = await page.goto(`/admin/fees/invoices/${inst.invoiceId}`);
  expect(page.url()).toContain("denied=fees%3Aread");
  expect(res?.status()).toBe(200);
});

test("dues: send a reminder now; the outbox records it", async ({ page }) => {
  await loginAs(page, "accounts");
  await page.goto("/admin/fees/dues");
  const first = page.getByRole("row").nth(1);
  const before = await testDb.outbox.count({ where: { template: "overdue-reminder" } });
  await first.getByRole("button", { name: "Remind" }).click();
  await expect(page.getByText(/Reminder sent to/)).toBeVisible();
  expect(await testDb.outbox.count({ where: { template: "overdue-reminder" } })).toBeGreaterThan(before);
  const csv = await page.request.get("/api/admin/dues/export?filter=overdue");
  expect(csv.headers()["content-type"]).toContain("text/csv");
});

test("cron endpoints need the secret and are idempotent", async ({ request }) => {
  expect((await request.post("/api/cron/late-fees")).status()).toBe(401);
  expect(
    (await request.post("/api/cron/late-fees", { headers: { Authorization: "Bearer nope" } })).status(),
  ).toBe(401);
  const auth = { Authorization: `Bearer ${process.env.CRON_SECRET ?? "dev-cron-secret"}` };
  const first = await (await request.post("/api/cron/late-fees", { headers: auth })).json();
  expect(first.ok).toBe(true);
  const second = await (await request.post("/api/cron/late-fees", { headers: auth })).json();
  expect(second.result).toMatchObject({ charged: 0, flagged: 0, forfeited: 0 });
  expect((await request.get("/api/cron/unknown", { headers: auth })).status()).toBe(404);
});

test("axe: fee and payment screens have no serious or critical issues (light and dark)", async ({ page }) => {
  test.setTimeout(240_000);
  const invoice = await testDb.invoice.findFirstOrThrow({ where: { status: "OVERDUE" } });
  const structure = await testDb.feeStructure.findFirstOrThrow({ where: { status: "ACTIVE" } });
  await loginAs(page, "accounts");
  for (const path of [
    "/admin/fees",
    `/admin/fees/structures/${structure.id}?revise=1`,
    "/admin/fees/rules",
    "/admin/fees/concessions",
    `/admin/fees/invoices/${invoice.id}`,
    "/admin/fees/dues",
    "/admin/payments",
    `/admin/payments/new?student=${invoice.studentId}`,
    "/admin/payments/refunds",
    "/admin/payments/reconciliation",
  ]) {
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
            `${path} ${theme} ${v.id}: ${v.nodes
              .map((n) => n.target.join(" "))
              .slice(0, 3)
              .join(" | ")}`,
        ),
      ).toEqual([]);
    }
  }
});
