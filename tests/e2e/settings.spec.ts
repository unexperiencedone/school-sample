import { expect, test, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { Prisma } from "@prisma/client";
import { loginAs } from "./helpers";
import { testDb } from "./db";

test.use({ reducedMotion: "reduce" });

const tag = () =>
  Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");

const ADMIN_EMAIL = "admin@aurelia-sample.test";
const PARENT_EMAIL = "parent@aurelia-sample.test";

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

/** Opens a native <details> only if it is closed (a refresh after a save can leave it open). */
async function openDetails(box: Locator) {
  if (!(await box.evaluate((d) => (d as HTMLDetailsElement).open))) await box.locator("summary").click();
}

test.describe("school profile", () => {
  test("super admin edits the profile (restored after); a bad fee is refused; the principal can only read", async ({
    page,
  }) => {
    const original = await testDb.setting.findUnique({ where: { key: "school_profile" } });
    const stamp = tag();
    try {
      await loginAs(page, "super_admin");
      await page.goto("/admin/settings");
      await expect(page.getByRole("heading", { name: "School profile", level: 1 })).toBeVisible();
      await expect(page.getByRole("link", { name: /Years and terms/ })).toHaveAttribute(
        "href",
        "/admin/academics/years",
      );
      await expect(page.getByRole("link", { name: /Plans and rules/ })).toHaveAttribute(
        "href",
        "/admin/fees/rules",
      );

      const auditBefore = await testDb.auditLog.count({ where: { action: "settings.school_profile" } });
      await page.getByLabel("Tagline").fill(`Curious minds, steady hearts ${stamp}`);
      await page.getByRole("button", { name: "Save school profile" }).click();
      await expect
        .poll(async () => {
          const row = await testDb.setting.findUnique({ where: { key: "school_profile" } });
          return (row?.value as { tagline?: string } | undefined)?.tagline;
        })
        .toBe(`Curious minds, steady hearts ${stamp}`);
      await expect
        .poll(() => testDb.auditLog.count({ where: { action: "settings.school_profile" } }))
        .toBe(auditBefore + 1);
      const saved = (await testDb.setting.findUniqueOrThrow({ where: { key: "school_profile" } })).value as {
        registrationFeePaise: number;
        addressLines: string[];
      };
      expect(Number.isInteger(saved.registrationFeePaise)).toBe(true);
      expect(saved.addressLines.length).toBeGreaterThan(0);

      // A fee that is not an amount is refused by the server and nothing is saved
      await page.getByLabel("Registration fee (₹)").fill("ten thousand");
      await page.getByLabel("Tagline").fill(`Should not be saved ${stamp}`);
      await page.getByRole("button", { name: "Save school profile" }).click();
      await expect(page.getByText("Enter the registration fee in rupees")).toBeVisible();
      const after = (await testDb.setting.findUniqueOrThrow({ where: { key: "school_profile" } })).value as {
        tagline: string;
      };
      expect(after.tagline).toBe(`Curious minds, steady hearts ${stamp}`);

      // The principal has settings:read: they can see the profile but not change it
      await loginAs(page, "principal");
      await page.goto("/admin/settings");
      await expect(page.getByLabel("School name")).toHaveAttribute("readonly", "");
      await expect(page.getByRole("button", { name: "Save school profile" })).toHaveCount(0);
      const put = await page.request.put("/api/admin/settings", { data: {} });
      expect(put.status()).toBe(403);
      const get = await page.request.get("/api/admin/settings");
      expect(get.status()).toBe(200);
    } finally {
      if (original) {
        await testDb.setting.update({
          where: { key: "school_profile" },
          data: { value: original.value as Prisma.InputJsonValue },
        });
      } else {
        await testDb.setting.deleteMany({ where: { key: "school_profile" } });
      }
    }
  });
});

test.describe("integrations and scheduled jobs", () => {
  test("send-tests report inline and leave a trail; Run now records a CronRun", async ({ page }) => {
    const started = new Date();
    await loginAs(page, "super_admin");
    await page.goto("/admin/settings/integrations");
    await expect(page.getByRole("heading", { name: "Integrations", level: 1 })).toBeVisible();

    // Status table: text badges and variable names only
    const email = page.locator('[data-integration="email"]');
    await expect(email).toContainText("MOCK");
    await expect(email).toContainText("EMAIL_PROVIDER");
    await expect(page.locator('[data-integration="payments"]')).toContainText("MOCK_WEBHOOK_SECRET");
    await expect(page.locator('[data-integration="payments"]')).toContainText("Yes");

    // Email goes to the signed-in admin through the active adapter: an Outbox row in mock mode
    await email.getByRole("button", { name: "Send test: Email" }).click();
    await expect(email.getByRole("status")).toContainText("Passed");
    await expect(email.getByRole("status")).toContainText(ADMIN_EMAIL);
    await expect
      .poll(() =>
        testDb.outbox.count({
          where: {
            template: "test-message",
            channel: "EMAIL",
            to: ADMIN_EMAIL,
            status: "SENT",
            createdAt: { gte: started },
          },
        }),
      )
      .toBeGreaterThanOrEqual(1);
    await expect(email.getByRole("link", { name: "View in the Outbox" })).toBeVisible();
    await expect
      .poll(() =>
        testDb.auditLog.count({
          where: { action: "integration.test", entityId: "email", createdAt: { gte: started } },
        }),
      )
      .toBe(1);

    // WhatsApp needs a valid number; consent is not checked for a self-test
    const wa = page.locator('[data-integration="whatsapp"]');
    await expect(wa).toContainText("consent settings aren't checked");
    await wa.getByLabel("Number to test (WhatsApp)").fill("12345");
    await wa.getByRole("button", { name: "Send test: WhatsApp" }).click();
    await expect(wa.getByRole("status")).toContainText("Failed");
    await expect(wa.getByRole("status")).toContainText("10-digit Indian mobile number");
    await wa.getByLabel("Number to test (WhatsApp)").fill("+91 98765 43210");
    await wa.getByRole("button", { name: "Send test: WhatsApp" }).click();
    await expect(wa.getByRole("status")).toContainText("Passed");
    await expect(wa.getByRole("status")).toContainText("ending 3210");
    await expect
      .poll(() =>
        testDb.outbox.count({
          where: {
            channel: "WHATSAPP",
            to: "919876543210",
            template: "test-message",
            createdAt: { gte: started },
          },
        }),
      )
      .toBeGreaterThanOrEqual(1);

    // The other adapters round-trip without touching real money or real people
    const storage = page.locator('[data-integration="storage"]');
    await storage.getByRole("button", { name: /Send test/ }).click();
    await expect(storage.getByRole("status")).toContainText("Passed");
    const payments = page.locator('[data-integration="payments"]');
    await payments.getByRole("button", { name: /Send test/ }).click();
    await expect(payments.getByRole("status")).toContainText("Passed");
    await expect(payments.getByRole("status")).toContainText("Nothing was charged");
    const captcha = page.locator('[data-integration="captcha"]');
    await captcha.getByRole("button", { name: /Send test/ }).click();
    await expect(captcha.getByRole("status")).toContainText("Passed");

    // No audit row for a test may carry a secret
    const logged = await testDb.auditLog.findMany({
      where: { action: "integration.test", createdAt: { gte: started } },
    });
    expect(logged.length).toBeGreaterThanOrEqual(5);
    for (const row of logged) expect(JSON.stringify(row.after)).not.toMatch(/secret|password|api[_-]?key/i);

    // Scheduled jobs: Run now calls the same job as the cron route and records a CronRun
    const card = page.locator('[data-job="outbox-retry"]');
    const runsBefore = await testDb.cronRun.count({ where: { job: "outbox-retry" } });
    await card.getByRole("button", { name: "Run now: Outbox retry" }).click();
    await expect(card.getByRole("status")).toContainText("Passed");
    await expect.poll(() => testDb.cronRun.count({ where: { job: "outbox-retry" } })).toBe(runsBefore + 1);
    const run = await testDb.cronRun.findFirstOrThrow({
      where: { job: "outbox-retry" },
      orderBy: { startedAt: "desc" },
    });
    expect(run.ok).toBe(true);
    expect(run.finishedAt).not.toBeNull();
    await expect(card.locator("[data-run]").first()).toContainText("OK");
    await expect
      .poll(() => testDb.auditLog.count({ where: { action: "cron.run_now", entityId: run.id } }))
      .toBe(1);
  });

  test("the principal can read the status but not run anything; the API agrees and exposes no values", async ({
    page,
  }) => {
    await loginAs(page, "principal");
    await page.goto("/admin/settings/integrations");
    await expect(page.getByRole("button", { name: /Send test/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Run now/ })).toHaveCount(0);
    await expect(page.getByText("Super admin only").first()).toBeVisible();

    const status = await page.request.get("/api/admin/integrations/status");
    expect(status.status()).toBe(200);
    const body = (await status.json()) as {
      data: { integrations: { env: Record<string, unknown>[] }[]; cron: { job: string }[] };
    };
    expect(body.data.cron.map((c) => c.job)).toEqual(
      expect.arrayContaining(["late-fees", "reminders", "outbox-retry"]),
    );
    for (const i of body.data.integrations)
      for (const e of i.env) expect(Object.keys(e).sort()).toEqual(["name", "present"]);

    expect((await page.request.post("/api/admin/integrations/email/test", { data: {} })).status()).toBe(403);
  });
});

test.describe("users and roles", () => {
  test("changing a role needs a reason, is guarded, is restored, and shows in the audit log", async ({
    page,
  }) => {
    const email = "houseparent@aurelia-sample.test";
    const target = await testDb.user.findUniqueOrThrow({ where: { email } });
    const admin = await testDb.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
    const reason = `E2E role check ${tag()}`;
    try {
      await loginAs(page, "super_admin");
      await page.goto("/admin/settings/users");
      await expect(page.getByRole("heading", { name: "Users and roles", level: 1 })).toBeVisible();

      // Your own row offers no controls, and the server refuses the same change
      await expect(page.locator(`[data-user-email="${ADMIN_EMAIL}"]`)).toContainText(
        "You can't change your own account",
      );
      const self = await page.request.patch(`/api/admin/users/${admin.id}`, {
        data: { role: "PRINCIPAL", reason: "E2E trying to demote myself" },
      });
      expect(self.status()).toBe(409);
      expect(((await self.json()) as { error: { code: string } }).error.code).toBe("ROLE_CHANGE_BLOCKED");
      expect((await testDb.user.findUniqueOrThrow({ where: { id: admin.id } })).role).toBe("SUPER_ADMIN");

      // A reason is required
      const noReason = await page.request.patch(`/api/admin/users/${target.id}`, {
        data: { role: "TEACHER" },
      });
      expect(noReason.status()).toBe(422);

      const row = page.locator(`[data-user-email="${email}"]`);
      await expect(row.locator("[data-role]")).toContainText("Houseparent");
      const roleBox = row.locator("details").nth(0);
      await openDetails(roleBox);
      await roleBox.getByLabel("New role").selectOption("TEACHER");
      await roleBox.getByLabel("Reason").fill(reason);
      await roleBox.locator('button[type="submit"]').click();
      await expect
        .poll(async () => (await testDb.user.findUniqueOrThrow({ where: { email } })).role)
        .toBe("TEACHER");
      await expect(row.locator("[data-role]")).toContainText("Teacher");

      const entry = await testDb.auditLog.findFirstOrThrow({
        where: { action: "user.role_change", entityId: target.id, reason },
      });
      expect(entry.before).toEqual({ role: "HOUSEPARENT" });
      expect(entry.after).toEqual({ role: "TEACHER" });
      expect(entry.actorId).toBe(admin.id);

      // The change is in the audit viewer as a readable before/after
      await page.goto(`/admin/settings/audit?q=${encodeURIComponent("user.role_change")}`);
      const panel = page.locator("tr[id]", { hasText: reason });
      await expect(panel).toHaveCount(1);
      const toggle = page.locator(`[aria-controls="${await panel.getAttribute("id")}"]`);
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(panel).toBeVisible();
      await expect(panel).toContainText("role");
      await expect(panel).toContainText("HOUSEPARENT");
      await expect(panel).toContainText("TEACHER");
      await expect(panel).toContainText(reason);
    } finally {
      await testDb.user.update({ where: { email }, data: { role: target.role, active: target.active } });
    }
  });

  test("invite a staff member, switch their access off and on, and see a duplicate refused", async ({
    page,
  }) => {
    const email = `e2e.invite.${tag()}@example.com`;
    const started = new Date();
    try {
      await loginAs(page, "super_admin");
      await page.goto("/admin/settings/users");
      await page.getByLabel("Full name").fill("E2E Invitee");
      await page.getByLabel("Email address").fill(email);
      await page.getByLabel(/^Role/).selectOption("TEACHER");
      await page.getByRole("button", { name: "Send invite" }).click();
      await expect.poll(() => testDb.user.findUnique({ where: { email } })).not.toBeNull();
      const invited = await testDb.user.findUniqueOrThrow({ where: { email } });
      expect(invited.role).toBe("TEACHER");
      expect(invited.active).toBe(true);
      expect(invited.passwordHash).toBeNull();
      await expect
        .poll(() =>
          testDb.outbox.count({ where: { to: email, template: "magic-link", createdAt: { gte: started } } }),
        )
        .toBe(1);
      expect(await testDb.auditLog.count({ where: { action: "user.invite", entityId: invited.id } })).toBe(1);

      // The same address again is refused (and nothing is created twice)
      await page.getByLabel("Full name").fill("E2E Invitee Again");
      await page.getByLabel("Email address").fill(email);
      await page.getByRole("button", { name: "Send invite" }).click();
      await expect(page.getByText("already exists").first()).toBeVisible();
      expect(await testDb.user.count({ where: { email } })).toBe(1);

      // Switch access off, then on, each with a reason
      await page.reload();
      const row = page.locator(`[data-user-email="${email}"]`);
      await expect(row).toContainText("Active");
      const accessBox = row.locator("details").nth(1);
      await openDetails(accessBox);
      await accessBox.getByLabel("Reason").fill("E2E: left the school");
      await accessBox.locator('button[type="submit"]').click();
      await expect
        .poll(async () => (await testDb.user.findUniqueOrThrow({ where: { email } })).active)
        .toBe(false);
      await expect(row).toContainText("Off");
      await expect(accessBox.locator("summary")).toContainText("Restore access");
      await openDetails(accessBox);
      await accessBox.getByLabel("Reason").fill("E2E: back again");
      await accessBox.locator('button[type="submit"]').click();
      await expect
        .poll(async () => (await testDb.user.findUniqueOrThrow({ where: { email } })).active)
        .toBe(true);
      expect(
        await testDb.auditLog.count({
          where: { entityId: invited.id, action: { in: ["user.deactivate", "user.reactivate"] } },
        }),
      ).toBe(2);
    } finally {
      await testDb.verificationToken.deleteMany({ where: { identifier: email } });
      await testDb.user.deleteMany({ where: { email } });
    }
  });

  test("the principal is denied the users page and its API; the role matrix is read-only for the super admin", async ({
    page,
  }) => {
    await loginAs(page, "principal");
    await page.goto("/admin/settings/users");
    await expect(page).toHaveURL(/denied=users%3Amanage/);
    expect((await page.request.get("/api/admin/users")).status()).toBe(403);
    expect(
      (
        await page.request.post("/api/admin/users", {
          data: { email: `e2e.denied.${tag()}@example.com`, name: "Not Allowed", role: "TEACHER" },
        })
      ).status(),
    ).toBe(403);
    await page.goto("/admin/settings/privacy");
    await expect(page).toHaveURL(/denied=privacy%3Amanage/);

    await loginAs(page, "super_admin");
    await page.goto("/admin/settings/users");
    const matrix = page.getByRole("region", { name: "What each role can do" });
    await expect(matrix.getByRole("columnheader", { name: "Registrar" })).toBeVisible();
    const row = matrix.getByRole("row", { name: /users:manage/ });
    // Only the super admin holds users:manage: one "Yes" in the row
    await expect(row.getByText("Yes", { exact: true })).toHaveCount(1);
    await expect(matrix.getByRole("row", { name: /fees:revise/ })).toContainText("sensitive");
  });
});

test.describe("audit log", () => {
  test("filters, cursor pages, redaction and a logged CSV export", async ({ page }) => {
    const prefix = `e2e.settings.${tag()}`;
    const admin = await testDb.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
    const secrets = ["super-secret-hash-value", "tok_live_do_not_show", "allergic-to-peanuts-detail"];
    try {
      await testDb.auditLog.create({
        data: {
          actorId: admin.id,
          actorRole: "SUPER_ADMIN",
          action: `${prefix}.change`,
          entity: "E2E",
          entityId: "e2e-1",
          reason: "E2E redaction check",
          ip: "203.0.113.7",
          before: { name: "Old name", passwordHash: secrets[0], profile: { accessToken: secrets[1] } },
          after: {
            name: "New name",
            passwordHash: "another-secret-hash",
            profile: { accessToken: "tok_live_second" },
            medical: { allergies: secrets[2] },
          },
        },
      });
      await testDb.auditLog.createMany({
        data: Array.from({ length: 6 }, (_, i) => ({
          actorId: admin.id,
          actorRole: "SUPER_ADMIN" as const,
          action: `${prefix}.page${i}`,
          entity: "E2E",
          after: { n: i },
        })),
      });

      await loginAs(page, "super_admin");
      await page.goto("/admin/settings/audit");
      await expect(page.getByRole("heading", { name: "Audit log", level: 1 })).toBeVisible();

      // Filter by action text, then by entity and actor, then by an IST date range
      await page.getByRole("searchbox", { name: "Action contains" }).fill(prefix);
      await expect(page).toHaveURL(/q=e2e\.settings/);
      await expect(page.locator("[data-audit-row]")).toHaveCount(7);
      await page.getByLabel("Entity").selectOption("E2E");
      await expect(page).toHaveURL(/entity=E2E/);
      await page.getByLabel("Actor").selectOption({ label: admin.name ?? admin.email });
      await expect(page).toHaveURL(/actor=/);
      await expect(page.locator("[data-audit-row]")).toHaveCount(7);
      await page.getByLabel("From (IST)").fill("2099-01-01");
      await expect(page.getByText("No entries match")).toBeVisible();
      await page.getByLabel("From (IST)").fill("");
      await expect(page.locator("[data-audit-row]")).toHaveCount(7);

      // The expandable row shows changed fields only and never a secret
      const change = page.locator("tr[id]", { hasText: "E2E redaction check" });
      const toggle = page.locator(`[aria-controls="${await change.getAttribute("id")}"]`);
      await toggle.click();
      await expect(change).toBeVisible();
      await expect(change).toContainText("203.0.113.7");
      await expect(change).toContainText("Old name");
      await expect(change).toContainText("New name");
      await expect(change).toContainText("[redacted]");
      await expect(change).toContainText("profile.accessToken");
      const html = await page.content();
      for (const secret of [...secrets, "another-secret-hash", "tok_live_second"])
        expect(html, `page must not contain ${secret}`).not.toContain(secret);

      // JSON API: same rules, cursor pagination
      const api = await page.request.get(`/api/admin/audit-logs?q=${prefix}&size=5`);
      expect(api.status()).toBe(200);
      const text = await api.text();
      for (const secret of [...secrets, "another-secret-hash", "tok_live_second"])
        expect(text).not.toContain(secret);
      const first = JSON.parse(text) as {
        data: { id: string }[];
        page: { next: string | null; total: number };
      };
      expect(first.data).toHaveLength(5);
      expect(first.page.total).toBe(7);
      expect(first.page.next).not.toBeNull();
      const second = (await (
        await page.request.get(`/api/admin/audit-logs?q=${prefix}&size=5&after=${first.page.next}`)
      ).json()) as { data: { id: string }[] };
      expect(second.data).toHaveLength(2);
      expect(second.data.map((r) => r.id).some((id) => first.data.some((f) => f.id === id))).toBe(false);

      // CSV export: filtered, formula-safe, redacted, and itself audited
      const exportsBefore = await testDb.auditLog.count({ where: { action: "audit.export" } });
      const csv = await page.request.get(`/api/admin/audit-logs/export?q=${prefix}&entity=E2E`);
      expect(csv.status()).toBe(200);
      expect(csv.headers()["content-type"]).toContain("text/csv");
      expect(csv.headers()["content-disposition"]).toContain("audit-log-");
      const csvText = await csv.text();
      expect(csvText).toContain(`${prefix}.change`);
      expect(csvText).toContain("[redacted]");
      for (const secret of secrets) expect(csvText).not.toContain(secret);
      await expect
        .poll(() => testDb.auditLog.count({ where: { action: "audit.export" } }))
        .toBe(exportsBefore + 1);

      // The Export CSV link carries the current filters
      await page.goto(`/admin/settings/audit?q=${prefix}`);
      await expect(page.getByRole("link", { name: "Export CSV" })).toHaveAttribute(
        "href",
        new RegExp(`q=${prefix}`),
      );

      // The principal may read the log; accounts may not
      await loginAs(page, "principal");
      expect((await page.request.get(`/api/admin/audit-logs?q=${prefix}&size=5`)).status()).toBe(200);
      await loginAs(page, "accounts");
      await page.goto("/admin/settings/audit");
      await expect(page).toHaveURL(/denied=audit%3Aread/);
      expect((await page.request.get("/api/admin/audit-logs")).status()).toBe(403);
      expect((await page.request.get("/api/admin/audit-logs/export")).status()).toBe(403);
    } finally {
      await testDb.auditLog.deleteMany({ where: { action: { startsWith: prefix } } });
    }
  });
});

test.describe("privacy requests", () => {
  test("an export request is bundled and closed; a deletion request shows what is kept and is rejected", async ({
    page,
  }) => {
    const stamp = tag();
    const exportReq = await testDb.dataRequest.create({
      data: { kind: "EXPORT", subjectEmail: PARENT_EMAIL, notes: `E2E export ${stamp}` },
    });
    const deletionReq = await testDb.dataRequest.create({
      data: { kind: "DELETION", subjectEmail: PARENT_EMAIL, notes: `E2E deletion ${stamp}` },
    });
    try {
      await loginAs(page, "super_admin");
      await page.goto("/admin/settings/privacy");
      await expect(page.getByRole("heading", { name: "Privacy requests", level: 1 })).toBeVisible();
      await expect(page.getByRole("link", { name: /^Open \(/ })).toHaveAttribute("aria-current", "page");
      await expect(page.locator(`[data-request="${PARENT_EMAIL}"]`).first()).toBeVisible();
      await page.getByRole("link", { name: /^Rejected \(/ }).click();
      await expect(page).toHaveURL(/status=REJECTED/);

      // ── Export: bundle, then close ─────────────────────────────────────
      await page.goto(`/admin/settings/privacy/${exportReq.id}`);
      await expect(page.getByRole("heading", { name: "Data export request", level: 1 })).toBeVisible();
      await expect(page.getByText(`E2E export ${stamp}`)).toBeVisible();
      const bundleBefore = await testDb.auditLog.count({
        where: { action: "privacy.bundle", entityId: exportReq.id },
      });
      const link = page.getByRole("link", { name: "Prepare data bundle" });
      const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
      expect(download.suggestedFilename()).toBe(`data-bundle-${exportReq.id}.json`);
      await expect
        .poll(() => testDb.auditLog.count({ where: { action: "privacy.bundle", entityId: exportReq.id } }))
        .toBe(bundleBefore + 1);

      const res = await page.request.get(`/api/admin/privacy/${exportReq.id}/bundle`);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-disposition"]).toContain("attachment");
      const text = await res.text();
      const bundle = JSON.parse(text) as {
        subjectEmail: string;
        children: { firstName: string; admissionNo: string }[];
        guardianRecords: { email: string | null }[];
        consent: { guardians: { email: boolean }[] };
        fees: { invoices: { count: number; items: unknown[] }; payments: { count: number } };
        notIncluded: string[];
      };
      expect(bundle.subjectEmail).toBe(PARENT_EMAIL);
      expect(bundle.guardianRecords.length).toBeGreaterThanOrEqual(1);
      expect(bundle.children.map((c) => c.firstName)).toEqual(expect.arrayContaining(["Ira", "Anvi"]));
      expect(bundle.consent.guardians.length).toBeGreaterThanOrEqual(1);
      expect(bundle.fees.invoices.count).toBeGreaterThan(0);
      expect(bundle.fees.invoices.items).toHaveLength(bundle.fees.invoices.count);
      expect(bundle.notIncluded.length).toBeGreaterThan(0);
      // Credentials and medical content are never part of a bundle
      expect(text).not.toMatch(/passwordHash|resumeTokenHash|bloodGroup|allergies|medications/);
      expect(
        await testDb.auditLog.count({ where: { action: "privacy.bundle", entityId: exportReq.id } }),
      ).toBe(bundleBefore + 2);

      // Close it with notes
      await page.getByLabel("Notes").fill(`Bundle sent to the parent ${stamp}`);
      await page.getByRole("button", { name: "Save outcome" }).click();
      await expect
        .poll(
          async () => (await testDb.dataRequest.findUniqueOrThrow({ where: { id: exportReq.id } })).status,
        )
        .toBe("DONE");
      const done = await testDb.dataRequest.findUniqueOrThrow({ where: { id: exportReq.id } });
      expect(done.handledById).not.toBeNull();
      expect(done.notes).toContain(`E2E export ${stamp}`);
      expect(done.notes).toContain(`Bundle sent to the parent ${stamp}`);
      const resolved = await testDb.auditLog.findFirstOrThrow({
        where: { action: "privacy.resolve", entityId: exportReq.id },
      });
      expect(resolved.reason).toBe(`Bundle sent to the parent ${stamp}`);
      expect(resolved.before).toEqual({ status: "OPEN" });
      await expect(page.getByText("This request is closed.")).toBeVisible();

      // A closed request can't be closed again
      const again = await page.request.patch(`/api/admin/privacy/${exportReq.id}`, {
        data: { status: "REJECTED", notes: "Second attempt" },
      });
      expect(again.status()).toBe(409);
      expect(((await again.json()) as { error: { code: string } }).error.code).toBe("ALREADY_HANDLED");

      // ── Deletion: checklist, no automatic erase, no bundle ─────────────
      await page.goto(`/admin/settings/privacy/${deletionReq.id}`);
      await expect(page.getByRole("heading", { name: "Deletion request", level: 1 })).toBeVisible();
      await expect(page.getByRole("link", { name: "Prepare data bundle" })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Would be erased" })).toBeVisible();
      await expect(
        page.getByRole("heading", { name: /Retained for legal reasons \(fee records 8 years\)/ }),
      ).toBeVisible();
      await expect(page.locator('[data-policy="invoices"]')).toContainText("8 years");
      await expect(page.locator('[data-policy="invoices"]')).toContainText("held");
      await expect(page.locator('[data-policy="account"]')).toContainText("1 held");
      await expect(page.getByText(/Nothing is erased automatically/).first()).toBeVisible();
      const noBundle = await page.request.get(`/api/admin/privacy/${deletionReq.id}/bundle`);
      expect(noBundle.status()).toBe(422);
      expect(((await noBundle.json()) as { error: { code: string } }).error.code).toBe("NOT_AN_EXPORT");

      // Notes are required, and the data is still there afterwards
      await page.getByLabel("Outcome").selectOption("REJECTED");
      await page.getByLabel("Notes").fill("ok");
      await page.getByRole("button", { name: "Save outcome" }).click();
      expect((await testDb.dataRequest.findUniqueOrThrow({ where: { id: deletionReq.id } })).status).toBe(
        "OPEN",
      );
      await page.getByLabel("Notes").fill(`Fee records must be kept; asked to write back ${stamp}`);
      await page.getByRole("button", { name: "Save outcome" }).click();
      await expect
        .poll(
          async () => (await testDb.dataRequest.findUniqueOrThrow({ where: { id: deletionReq.id } })).status,
        )
        .toBe("REJECTED");
      expect(await testDb.user.count({ where: { email: PARENT_EMAIL } })).toBe(1);

      // The queue's tabs now list both
      await page.goto("/admin/settings/privacy?status=ALL");
      await expect(page.getByRole("link", { name: /^All \(/ })).toHaveAttribute("aria-current", "page");

      // The principal can't see or change any of it
      await loginAs(page, "principal");
      expect((await page.request.get("/api/admin/privacy")).status()).toBe(403);
      expect((await page.request.get(`/api/admin/privacy/${exportReq.id}/bundle`)).status()).toBe(403);
    } finally {
      await testDb.dataRequest.deleteMany({ where: { id: { in: [exportReq.id, deletionReq.id] } } });
    }
  });
});

test.describe("accessibility", () => {
  test("axe: settings pages have no serious or critical issues (light and dark)", async ({ page }) => {
    await loginAs(page, "super_admin");

    await page.goto("/admin/settings");
    await expect(page.getByRole("heading", { name: "School profile", level: 1 })).toBeVisible();
    await axe(page, "school");

    await page.goto("/admin/settings/integrations");
    await expect(page.getByRole("heading", { name: "Scheduled jobs" })).toBeVisible();
    await page
      .locator('[data-integration="email"]')
      .getByRole("button", { name: "Send test: Email" })
      .click();
    await expect(page.locator('[data-integration="email"]').getByRole("status")).toContainText("Passed");
    await axe(page, "integrations");

    await page.goto("/admin/settings/users");
    await expect(page.getByRole("heading", { name: "Staff accounts" })).toBeVisible();
    await page.locator("summary", { hasText: "Change role" }).first().click();
    await axe(page, "users");

    await page.goto("/admin/settings/audit");
    await expect(page.getByRole("heading", { name: "Audit log", level: 1 })).toBeVisible();
    const toggle = page.getByRole("button", { name: /Details/ }).first();
    if (await toggle.count()) await toggle.click();
    await axe(page, "audit");

    await page.goto("/admin/settings/privacy");
    await expect(page.getByRole("heading", { name: "Privacy requests", level: 1 })).toBeVisible();
    await axe(page, "privacy");
  });
});
