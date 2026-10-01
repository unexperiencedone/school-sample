import { expect, type Page } from "@playwright/test";

/** Pre-sets cookie consent and suppresses the Open House modal so tests aren't interrupted. */
export async function quietVisitor(page: Page) {
  await page
    .context()
    .addCookies([
      {
        name: "ah_consent",
        value: encodeURIComponent(JSON.stringify({ analytics: false, marketing: false, decidedAt: "e2e" })),
        url: page.context().pages()[0]?.url().startsWith("http") ? page.url() : "http://localhost",
      },
    ]);
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("ah_event_modal_seen", "open-morning-october-2026");
    } catch {
      /* ignore */
    }
  });
}

export async function loginAs(
  page: Page,
  role:
    | "principal"
    | "admissions"
    | "accounts"
    | "teacher"
    | "parent"
    | "applicant"
    | "super_admin"
    | "registrar"
    | "hr"
    | "houseparent",
) {
  await page.goto("/login?demo=1");
  await page.getByTestId(`demo-${role}`).click();
  await expect(page).toHaveURL(/\/(admin|portal|applicant)/);
}

export function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e4)}@example.com`;
}

export async function fillEnquiry(
  page: Page,
  scope: ReturnType<Page["locator"]>,
  opts: { email: string; parentName?: string; classApplying?: string },
) {
  await scope.getByLabel("Parent / guardian name").fill(opts.parentName ?? "Meera Test-Parent");
  await scope.getByLabel("Mobile number").fill("+91 98765 43210");
  await scope.getByLabel(/^Email/).fill(opts.email);
  await scope.getByLabel("Child's name").fill("Anvi");
  await scope.getByLabel("Class applying for").selectOption(opts.classApplying ?? "Year 7");
  await scope.getByLabel("Day").selectOption("14");
  await scope.getByLabel("Month").selectOption("6");
  await scope.getByLabel("Year", { exact: true }).selectOption(String(new Date().getFullYear() - 12));
  await scope.getByRole("checkbox", { name: /parent or guardian/ }).check();
}
