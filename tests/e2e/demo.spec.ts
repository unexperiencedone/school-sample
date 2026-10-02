import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { MOMENTS } from "../../src/lib/demo/moments";
import { loginAs, quietVisitor } from "./helpers";
import { testDb } from "./db";

test.use({ reducedMotion: "reduce" });

test("the guided demo lists ten moments and every start button lands on the right screen", async ({
  page,
}) => {
  test.setTimeout(480_000);
  await quietVisitor(page);
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "Ten moments worth showing" })).toBeVisible();
  await expect(page.locator("ol > li > article")).toHaveCount(10);

  const go = async (
    buttonOrLink: "button" | "link",
    name: RegExp | string,
    from: string,
    expectPath: string,
  ) => {
    await page.goto("/demo");
    await page
      .locator("article", { has: page.getByRole("heading", { name: from }) })
      .getByRole(buttonOrLink, { name })
      .click();
    await expect(page).toHaveURL((u) => u.pathname === expectPath, { timeout: 90_000 });
    expect(page.url()).not.toContain("denied=");
    expect(page.url()).not.toContain("error=");
    await expect(page.locator("h1").first()).toBeVisible();
  };

  for (const m of MOMENTS) {
    const startLabel = m.role ? new RegExp(`^Start as ${m.roleLabel.split(",")[0]}$`) : /^Start$/;
    await go(m.role ? "button" : "link", startLabel, m.title, m.start);
    if (m.then) await go(m.then.role ? "button" : "link", m.then.label, m.title, m.then.to);
  }
});

test("the demo page is accessible, and only the super admin is offered the reset", async ({ page }) => {
  await quietVisitor(page);
  await page.goto("/demo");
  const bad = (
    await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()
  ).violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  expect(bad.map((v) => v.id)).toEqual([]);
  await expect(page.getByRole("button", { name: "Reset the sample school" })).toHaveCount(0);

  await loginAs(page, "principal");
  await page.goto("/demo");
  await expect(page.getByRole("button", { name: "Reset the sample school" })).toHaveCount(0);

  await loginAs(page, "super_admin");
  await page.goto("/demo");
  await expect(page.getByRole("button", { name: "Reset the sample school" })).toBeVisible();
});

test("resetting puts the sample school back as shipped", async ({ page }) => {
  test.setTimeout(180_000);
  const key = `e2e_marker_${Date.now()}`;
  await testDb.setting.create({ data: { key, value: { note: "entered during a demo" } } });
  await loginAs(page, "super_admin");
  await page.goto("/demo");
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Reset the sample school" }).click();
  await expect(page.getByText("The sample school has been reset to its starting state.")).toBeVisible({
    timeout: 90_000,
  });
  expect(await testDb.setting.count({ where: { key } })).toBe(0);
  expect(await testDb.student.count({ where: { status: "ACTIVE" } })).toBeGreaterThan(200);
  expect(await testDb.staffApplication.count()).toBe(20);
  expect(await testDb.setting.count({ where: { key: "demo_snapshot" } })).toBe(1);
});
