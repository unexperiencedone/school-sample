import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import ExcelJS from "exceljs";
import { loginAs } from "./helpers";
import { testDb } from "./db";

test.use({ reducedMotion: "reduce" });

const REPORTS = [
  { slug: "collections", title: "Fee collections" },
  { slug: "outstanding", title: "Outstanding fees" },
  { slug: "funnel", title: "Admissions funnel" },
  { slug: "sources", title: "Lead sources" },
  { slug: "seats", title: "Seat utilisation" },
] as const;

const currentYear = () => testDb.academicYear.findFirstOrThrow({ where: { isCurrent: true } });

/** Collects console errors and uncaught page errors from now on. */
function watchConsole(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("favicon")) problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  return problems;
}

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

test("accounts opens the hub and every report with no console errors, and every card toggles to its table", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const problems = watchConsole(page);
  const year = await currentYear();
  await loginAs(page, "accounts");

  const hub = await page.goto("/admin/reports");
  expect(hub?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
  for (const r of REPORTS) {
    const card = page.getByRole("link", { name: new RegExp(r.title) });
    await expect(card).toBeVisible();
    await expect(card).toContainText(/\d/); // a headline number
  }

  for (const r of REPORTS) {
    const res = await page.goto(`/admin/reports/${r.slug}`);
    expect(res?.status(), r.slug).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: r.title })).toBeVisible();
    await expect(page.getByLabel("Academic year")).toHaveValue(year.name);

    const groups = page.getByRole("group", { name: /: view as$/ });
    const count = await groups.count();
    expect(count, `${r.slug} has chart cards`).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const group = groups.nth(i);
      const figure = group.locator("xpath=ancestor::figure");
      await group.getByRole("button", { name: "Table" }).click();
      await expect(group.getByRole("button", { name: "Table" })).toHaveAttribute("aria-pressed", "true");
      await expect(group.getByRole("button", { name: "Chart" })).toHaveAttribute("aria-pressed", "false");
      await expect(
        figure.locator("table").or(figure.getByText("Nothing to show for this period.")),
      ).toBeVisible();
      await group.getByRole("button", { name: "Chart" }).click();
      await expect(group.getByRole("button", { name: "Chart" })).toHaveAttribute("aria-pressed", "true");
      await expect(figure.locator("table")).toHaveCount(0);
    }
  }
  expect(problems).toEqual([]);
});

test("a column's tooltip opens from the keyboard and carries the exact figure", async ({ page }) => {
  await loginAs(page, "accounts");
  await page.goto("/admin/reports/collections");
  const chart = page.getByRole("figure").first();
  await chart
    .getByRole("button", { name: /^[A-Z][a-z]{2} \d{4} · \d+ receipts?/ })
    .first()
    .focus();
  await expect(chart.getByText(/\d+ receipts? · ₹/)).toBeVisible();
});

test("the year and date range live in the URL and narrow the report", async ({ page }) => {
  const year = await currentYear();
  const previous = await testDb.academicYear.findFirstOrThrow({
    where: { isCurrent: false, startDate: { lt: year.startDate } },
    orderBy: { startDate: "desc" },
  });
  await loginAs(page, "principal");
  await page.goto("/admin/reports/collections");
  await page.getByLabel("Academic year").selectOption(previous.name);
  await expect(page).toHaveURL(new RegExp(`year=${previous.name}`));
  await expect(page.getByText(`Showing ${previous.name} ·`)).toBeVisible();

  await page.getByLabel("From", { exact: true }).fill(`${previous.startDate.getUTCFullYear()}-06-01`);
  await expect(page).toHaveURL(/from=\d{4}-06-01/);
  await page.getByLabel("To", { exact: true }).fill(`${previous.startDate.getUTCFullYear()}-08-31`);
  await expect(page).toHaveURL(/to=\d{4}-08-31/);
  const figure = page.getByRole("figure").first();
  await figure.getByRole("button", { name: "Table" }).click();
  // June, July and August only (plus the totals row)
  await expect(figure.getByRole("row")).toHaveCount(1 + 3 + 1);

  await page.getByRole("button", { name: "Clear dates" }).click();
  await expect(page).not.toHaveURL(/from=/);
  await expect(page.getByLabel("Academic year")).toHaveValue(previous.name);

  // a hand-edited URL with nonsense never errors
  const res = await page.goto("/admin/reports/collections?year=nope&from=garbage&to=2026-99-99");
  expect(res?.status()).toBe(200);
  await expect(page.getByLabel("Academic year")).toHaveValue(year.name);
});

test("accounts downloads CSV and XLSX, and every download is audited with its filter", async ({ page }) => {
  test.setTimeout(120_000);
  const startedAt = new Date(Date.now() - 5_000);
  const year = await currentYear();
  await loginAs(page, "accounts");
  await page.goto("/admin/reports/collections");

  // CSV from the page button
  const [csvDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Export CSV" }).click(),
  ]);
  expect(csvDownload.suggestedFilename()).toMatch(
    new RegExp(`^aurelia-collections-${year.name}-\\d{8}\\.csv$`),
  );
  const csvBytes = readFileSync(await csvDownload.path());
  expect([...csvBytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const csvText = csvBytes.toString("utf8").replace(/^﻿/, "");
  expect(csvText.split("\r\n")[0]).toBe("Month,Receipts,Collected (INR),Refunded (INR),Net collected (INR)");
  expect(csvText.split("\r\n").length).toBeGreaterThan(3);

  // headers, straight from the API with the same session
  const api = await page.request.get(`/api/admin/reports/collections?format=csv&year=${year.name}`);
  expect(api.status()).toBe(200);
  expect(api.headers()["content-type"]).toBe("text/csv; charset=utf-8");
  expect(api.headers()["content-disposition"]).toContain("attachment");
  expect(api.headers()["cache-control"]).toBe("no-store");
  const body = Buffer.from(await api.body());
  expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  expect(body.toString("utf8").replace(/^﻿/, "")).toBe(csvText);

  // one table as CSV from its card
  await page
    .getByRole("link", { name: "Download Collected by payment method as CSV" })
    .click({ trial: true });
  const method = await page.request.get(
    `/api/admin/reports/collections?format=csv&year=${year.name}&table=by-method`,
  );
  expect(method.status()).toBe(200);
  expect(Buffer.from(await method.body()).toString("utf8")).toContain(
    "Method,Receipts,Collected (INR),Refunded (INR),Net collected (INR)",
  );

  // XLSX from the page button
  const [xlsxDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Export Excel" }).click(),
  ]);
  expect(xlsxDownload.suggestedFilename()).toMatch(
    new RegExp(`^aurelia-collections-${year.name}-\\d{8}\\.xlsx$`),
  );
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(
    readFileSync(await xlsxDownload.path()) as unknown as Parameters<typeof wb.xlsx.load>[0],
  );
  expect(wb.worksheets.map((w) => w.name)).toEqual([
    "Collected by month",
    "Billed and collected by class",
    "Collected by fee head",
    "Collected by payment method",
  ]);
  const sheet = wb.getWorksheet("Collected by month")!;
  expect(String(sheet.getCell("A1").value)).toBe("Fee collections: Collected by month");
  expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 4 });
  expect(sheet.getRow(4).values).toEqual([
    undefined,
    "Month",
    "Receipts",
    "Collected",
    "Refunded",
    "Net collected",
  ]);
  const first = sheet.getRow(5);
  expect(typeof first.getCell(3).value).toBe("number");
  expect(first.getCell(3).numFmt).toContain("₹");
  expect(sheet.getColumn(1).width).toBeGreaterThan(8);
  const lastRow = sheet.rowCount; // last row number (actualRowCount skips the blank spacer row)
  expect(String(sheet.getCell(lastRow, 1).value)).toMatch(/^Generated .* IST$/);

  const xlsxApi = await page.request.get(`/api/admin/reports/seats?format=xlsx`);
  expect(xlsxApi.status()).toBe(200);
  expect(xlsxApi.headers()["content-type"]).toBe(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );

  await expect
    .poll(
      async () =>
        testDb.auditLog.count({
          where: {
            action: "report.export",
            entityId: "collections",
            actorRole: "ACCOUNTS",
            createdAt: { gte: startedAt },
          },
        }),
      { timeout: 20_000 },
    )
    .toBeGreaterThanOrEqual(4);
  const logged = await testDb.auditLog.findFirstOrThrow({
    where: { action: "report.export", entityId: "collections", createdAt: { gte: startedAt } },
    orderBy: { createdAt: "desc" },
  });
  expect(logged.entity).toBe("Report");
  expect(logged.after).toMatchObject({ filter: { year: year.name, from: null, to: null } });
});

test("a teacher is denied the reports and their downloads", async ({ page, request }) => {
  await loginAs(page, "teacher");
  await page.goto("/admin/reports");
  await expect(page).toHaveURL(/\/admin\?denied=reports%3Aread/);
  await page.goto("/admin/reports/collections");
  await expect(page).toHaveURL(/\/admin\?denied=reports%3Aread/);
  const csv = await page.request.get("/api/admin/reports/collections?format=csv");
  expect(csv.status()).toBe(403);
  expect((await csv.json()).error.code).toBe("FORBIDDEN");

  // signed out
  const anon = await request.get("/api/admin/reports/collections?format=csv");
  expect(anon.status()).toBe(401);
});

test("admissions may read reports but has no export buttons and cannot download", async ({ page }) => {
  await loginAs(page, "admissions");
  await page.goto("/admin/reports/funnel");
  await expect(page.getByRole("heading", { level: 1, name: "Admissions funnel" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Export/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /as CSV$/ })).toHaveCount(0);
  const res = await page.request.get("/api/admin/reports/funnel?format=xlsx");
  expect(res.status()).toBe(403);
});

test("the API validates what it is asked for", async ({ page }) => {
  await loginAs(page, "accounts");
  expect((await page.request.get("/api/admin/reports/payroll?format=csv")).status()).toBe(404);
  const badFormat = await page.request.get("/api/admin/reports/seats?format=pdf");
  expect(badFormat.status()).toBe(422);
  expect((await badFormat.json()).error.code).toBe("VALIDATION_FAILED");
  expect((await page.request.get("/api/admin/reports/seats?format=csv&from=2026-02-30")).status()).toBe(422);
  expect((await page.request.get("/api/admin/reports/seats?format=csv&table=nope")).status()).toBe(404);
});

test("related screens are linked only to those who may open them", async ({ page }) => {
  await loginAs(page, "accounts");
  await page.goto("/admin/reports/outstanding");
  await expect(page.getByRole("link", { name: "Open the Dues screen" })).toHaveAttribute(
    "href",
    "/admin/fees/dues",
  );
  await page.goto("/admin/reports/sources");
  await expect(page.getByRole("link", { name: "Simple view on Leads" })).toHaveCount(0);

  await loginAs(page, "admissions");
  await page.goto("/admin/reports/sources");
  await expect(page.getByRole("link", { name: "Simple view on Leads" })).toHaveAttribute(
    "href",
    "/admin/leads/sources",
  );
});

test("phones get no sideways page scroll on any report", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, "accounts");
  for (const path of ["/admin/reports", ...REPORTS.map((r) => `/admin/reports/${r.slug}`)]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
  }
});

test("axe: the hub and the report pages have no serious or critical issues (light and dark)", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await loginAs(page, "accounts");
  await page.goto("/admin/reports");
  await axe(page, "/admin/reports");

  for (const slug of ["collections", "seats"]) {
    await page.goto(`/admin/reports/${slug}`);
    await expect(page.getByRole("figure").first()).toBeVisible();
    await axe(page, `/admin/reports/${slug} (chart)`);
    const groups = page.getByRole("group", { name: /: view as$/ });
    for (let i = 0; i < (await groups.count()); i++)
      await groups.nth(i).getByRole("button", { name: "Table" }).click();
    await axe(page, `/admin/reports/${slug} (table)`);
  }
});
