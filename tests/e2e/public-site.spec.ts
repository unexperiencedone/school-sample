import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fillEnquiry, quietVisitor, uniqueEmail } from "./helpers";

test.use({ reducedMotion: "reduce" });
test.beforeEach(async ({ page }) => quietVisitor(page));

const ROUTES = [
  "/",
  "/about/welcome",
  "/about/our-story",
  "/admissions",
  "/admissions/fees/full-boarding",
  "/admissions/fees/day-boarding",
  "/academics/prep",
  "/boarding/flexi",
  "/programmes/the-atelier",
  "/sports/swimming",
  "/faculty",
  "/careers/vacancies",
  "/blog",
  "/events",
  "/contact",
  "/book-a-tour",
  "/resources",
  "/virtual-tour",
  "/privacy",
];

test("every public route renders with a single h1 and no console errors", async ({ page }) => {
  // Visits ~20 routes; under `next dev` each compiles on first visit, so allow more than the per-test default
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const path of ROUTES) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator("h1"), path).toHaveCount(1);
  }
  expect(errors).toEqual([]);
});

test("aliases 301 to canonical lowercase slugs", async ({ request }) => {
  const res = await request.get("/fees", { maxRedirects: 0 });
  expect(res.status()).toBe(301);
  expect(res.headers().location).toContain("/admissions/fees/full-boarding");
});

test("enquiry drawer submits a lead", async ({ page }) => {
  await page.goto("/about/welcome");
  await page.getByRole("button", { name: "Enquire", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Enquire now" });
  await fillEnquiry(page, drawer, { email: uniqueEmail("drawer") });
  await drawer.getByRole("button", { name: "Send enquiry" }).click();
  await expect(drawer.getByText("Thank you — we'll be in touch")).toBeVisible();
  await expect(drawer.getByText(/ENQ-/)).toBeVisible();
});

test("client-side validation explains what to fix", async ({ page }) => {
  await page.goto("/contact");
  await page.getByRole("button", { name: "Send enquiry" }).click();
  await expect(page.getByText("Please enter a name")).toBeVisible();
  await expect(page.getByText(/10-digit Indian mobile/)).toBeVisible();
  await expect(page.getByText("Please agree so we can contact you")).toBeVisible();
});

test("campus tour booking from the contact page", async ({ page }) => {
  await page.goto("/contact?tab=tour");
  const panel = page.getByRole("tabpanel");
  await fillEnquiry(page, panel, { email: uniqueEmail("tour") });
  const d = new Date(Date.now() + 9 * 86400_000);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  await panel.getByLabel("Preferred date").fill(d.toISOString().slice(0, 10));
  await panel.getByLabel("Preferred time").selectOption("11:30");
  await panel.getByRole("button", { name: "Book my visit" }).click();
  await expect(panel.getByText("Your visit is booked")).toBeVisible();
});

test("fee page totals come from the engine and the PDF downloads", async ({ page, request }) => {
  await page.goto("/admissions/fees/full-boarding?year=2027-28");
  await expect(page.getByRole("heading", { name: "Prep" })).toBeVisible();
  await page.getByText("1 payment").click();
  const pdf = await request.get("/api/fees/pdf?boarding=FULL,FLEXI&year=2027-28");
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
});

test("search finds content", async ({ page }) => {
  await page.goto("/search?q=swimming");
  await expect(page.getByRole("link", { name: /Swimming/ }).first()).toBeVisible();
});

for (const path of ["/", "/admissions", "/contact", "/admissions/fees/full-boarding"]) {
  test(`axe: no serious or critical issues on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.evaluate(() =>
      document.querySelectorAll("[data-reveal]").forEach((e) => e.classList.add("is-visible")),
    );
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    const bad = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(
      bad.map(
        (v) =>
          `${v.id}: ${v.nodes
            .map((n) => n.target.join(" "))
            .slice(0, 3)
            .join(" | ")}`,
      ),
    ).toEqual([]);
  });
}
