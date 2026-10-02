import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { assertCan } from "@/lib/rbac";
import { formatINR } from "@/lib/money";
import { rateLimit } from "@/lib/rate-limit";
import { verifyToken } from "@/lib/tokens";
import { phone as phoneSchema } from "@/lib/schemas/common";
import { school, siteUrl } from "@/config/school";
import { sendTemplate } from "@/lib/notify";
import { JOBS, type JobName } from "@/lib/services/jobs";
import { getCaptcha } from "@/integrations/captcha";
import { randomId } from "@/integrations/crypto";
import { signWebhookBody } from "@/integrations/crm-webhook";
import { NotConfiguredError } from "@/integrations/errors";
import { getPaymentAdapter } from "@/integrations/payments";
import { integrationStatuses } from "@/integrations/registry";
import { getStorage } from "@/integrations/storage";
import { formatDuration, scrubSecrets, summariseResult } from "./settings-rules";

/**
 * Integrations status page: which adapters are live, mock or off, a one-click test for each that can be tested,
 * and the scheduled jobs with a "Run now". Environment values are never read into anything shown or logged,
 * only whether a variable is set.
 */

type Actor = { id: string; role: Role; email: string; name: string | null };

export type TestOutcome = { key: string; ok: boolean; message: string; ms: number; href?: string };
export type JobOutcome = { job: string; ok: boolean; message: string; ms: number };

// ───────────────────────────── Status ─────────────────────────────

export function integrationOverview(actor: Pick<Actor, "role">) {
  assertCan(actor.role, "settings:read");
  return integrationStatuses();
}

// ───────────────────────────── Send test ─────────────────────────────

type Step = { message: string; href?: string };

const tail = (digits: string) => digits.replace(/\D/g, "").slice(-4);

/** Reads the Outbox row `sendTemplate` wrote: the adapter's failure is recorded there rather than thrown. */
async function outboxOutcome(ids: string[], sent: string, mock: boolean): Promise<Step> {
  const id = ids[0];
  const row = id ? await db.outbox.findUnique({ where: { id } }) : null;
  if (!row) throw new Error("Nothing was queued. Check the contact details and try again.");
  if (row.status !== "SENT")
    throw new Error(row.lastError ?? `The message ended as ${row.status.toLowerCase()}.`);
  return {
    message: mock ? `${sent} Mock mode: it is recorded in the Outbox and nothing leaves the building.` : sent,
    href: `/admin/outbox/${row.id}`,
  };
}

async function testEmail(actor: Actor, mock: boolean): Promise<Step> {
  const ids = await sendTemplate({
    template: "test-message",
    to: { email: actor.email },
    channels: ["EMAIL"],
    related: { type: "integration-test", id: "email" },
  });
  return outboxOutcome(ids, `Test email sent to ${actor.email}.`, mock);
}

async function testPhone(channel: "WHATSAPP" | "SMS", number: string, mock: boolean): Promise<Step> {
  const ids = await sendTemplate({
    template: "test-message",
    to: { phone: number },
    channels: [channel],
    related: { type: "integration-test", id: channel.toLowerCase() },
  });
  const label = channel === "WHATSAPP" ? "WhatsApp" : "SMS";
  return outboxOutcome(ids, `Test ${label} message sent to the number ending ${tail(number)}.`, mock);
}

async function testStorage(): Promise<Step> {
  const storage = getStorage();
  const key = `diagnostics/settings-test-${randomBytes(6).toString("hex")}.txt`;
  const body = Buffer.from(`Aurelia settings test ${new Date().toISOString()}`);
  await storage.put(key, body, "text/plain");
  let matches = false;
  try {
    matches = (await storage.get(key)).equals(body);
  } finally {
    await storage.delete(key);
  }
  if (!matches) throw new Error("The object read back did not match what was written.");
  return { message: "Wrote, read back and deleted a small test object." };
}

async function testPayments(actor: Actor): Promise<Step> {
  const adapter = getPaymentAdapter();
  const customer = { name: actor.name ?? "Settings test", email: actor.email, phone: "+91 90000 55501" };
  const returnUrl = `${siteUrl()}/admin/settings/integrations`;
  const order = await adapter.createOrder({
    amountPaise: 100,
    currency: "INR",
    receipt: `settings-test-${randomBytes(4).toString("hex")}`,
    customer,
    notes: { purpose: "settings-test" },
    idempotencyKey: randomId("settings-test"),
    returnUrl,
    webhookUrl: `${siteUrl()}/api/payments/webhook/${adapter.name}`,
  });
  const checkout = adapter.getCheckout(order, {
    customer,
    description: "Integration test",
    returnUrl,
  });
  return {
    message: `Created a ${formatINR(100)} order through ${adapter.name}; its checkout is a ${checkout.type}. Nothing was charged and nobody was sent to pay.`,
  };
}

async function testCaptcha(): Promise<Step> {
  const captcha = getCaptcha();
  if (captcha.issue) {
    const challenge = await captcha.issue();
    if (!verifyToken("captcha", challenge.token)) throw new Error("The issued token did not verify.");
    // "00000" can never be an answer (the alphabet has no zero), so a pass here would mean verification is broken
    if (await captcha.verify({ token: challenge.token, response: "00000" }))
      throw new Error("A wrong answer was accepted.");
    return { message: "Issued a challenge: its signed token verified and a wrong answer was rejected." };
  }
  if (captcha.widget === "none")
    return { message: "Captcha is switched off, so every check passes. Not recommended in production." };
  if (await captcha.verify({ token: "settings-test-invalid" }))
    throw new Error("The provider accepted a deliberately invalid token.");
  return { message: "The provider answered and rejected a deliberately invalid token, as it should." };
}

async function testLeadWebhook(): Promise<Step> {
  const url = process.env.LEAD_WEBHOOK_URL;
  if (!url) throw new NotConfiguredError("Lead webhook", ["LEAD_WEBHOOK_URL"]);
  const id = randomId("evt");
  const body = JSON.stringify({
    id,
    event: "ping",
    occurredAt: new Date().toISOString(),
    school: school.name,
    data: { test: true },
  });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-aurelia-event": "ping",
      "x-aurelia-delivery": id,
      "x-aurelia-signature": signWebhookBody(body),
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`The endpoint answered HTTP ${res.status}.`);
  return { message: `Signed ping delivered (HTTP ${res.status}).` };
}

export const PHONE_TEST_KEYS = ["whatsapp", "sms"] as const;

/** Runs one adapter's self-test. Failures are reported inline, never thrown; the attempt is audit-logged either way. */
export async function testIntegration(
  actor: Actor,
  key: string,
  input: { phone?: string } = {},
): Promise<TestOutcome> {
  assertCan(actor.role, "settings:write");
  const status = integrationStatuses().find((s) => s.key === key);
  if (!status || !status.testable)
    throw new ApiError(404, "NOT_TESTABLE", "That integration has no test, or it is switched off.");

  let phone: string | undefined;
  if ((PHONE_TEST_KEYS as readonly string[]).includes(key)) {
    const parsed = phoneSchema.safeParse(input.phone ?? "");
    if (!parsed.success)
      throw new ApiError(
        422,
        "VALIDATION_FAILED",
        parsed.error.issues[0]?.message ?? "Enter a valid number",
        {
          fieldErrors: { phone: [parsed.error.issues[0]?.message ?? "Enter a valid number"] },
        },
      );
    phone = parsed.data;
  }

  const limit = await rateLimit(`integration-test:${actor.id}`, 20, 600);
  if (!limit.ok)
    throw new ApiError(
      429,
      "RATE_LIMITED",
      `Too many tests. Try again in ${Math.ceil(limit.retryAfter / 60)} min.`,
    );

  const mock = status.mode === "MOCK";
  const started = Date.now();
  let outcome: TestOutcome;
  try {
    const step =
      key === "email"
        ? await testEmail(actor, mock)
        : key === "whatsapp"
          ? await testPhone("WHATSAPP", phone!, mock)
          : key === "sms"
            ? await testPhone("SMS", phone!, mock)
            : key === "storage"
              ? await testStorage()
              : key === "payments"
                ? await testPayments(actor)
                : key === "captcha"
                  ? await testCaptcha()
                  : await testLeadWebhook();
    outcome = { key, ok: true, message: step.message, ms: Date.now() - started, href: step.href };
  } catch (e) {
    outcome = {
      key,
      ok: false,
      message: scrubSecrets(e instanceof Error ? e.message : "The test failed"),
      ms: Date.now() - started,
    };
  }
  await audit({
    actor,
    action: "integration.test",
    entity: "Integration",
    entityId: key,
    after: {
      ok: outcome.ok,
      provider: status.provider,
      mode: status.mode,
      ms: outcome.ms,
      message: outcome.message,
    },
  });
  return outcome;
}

// ───────────────────────────── Scheduled jobs ─────────────────────────────

export const JOB_NAMES = Object.keys(JOBS) as JobName[];

export type CronRunView = {
  id: string;
  startedAt: Date;
  ms: number | null;
  ok: boolean | null;
  summary: string;
};

export async function cronOverview(actor: Pick<Actor, "role">) {
  assertCan(actor.role, "settings:read");
  const perJob = await Promise.all(
    JOB_NAMES.map((job) => db.cronRun.findMany({ where: { job }, orderBy: { startedAt: "desc" }, take: 10 })),
  );
  return JOB_NAMES.map((job, i) => ({
    job,
    runs: perJob[i]!.map((r): CronRunView => ({
      id: r.id,
      startedAt: r.startedAt,
      ms: r.finishedAt ? r.finishedAt.getTime() - r.startedAt.getTime() : null,
      ok: r.ok,
      summary: summariseResult(r.result),
    })),
  }));
}

/**
 * Runs a job the same way `/api/cron/[job]` does (same functions, a CronRun row for the run) and reports the
 * outcome. The jobs are idempotent, so running one by hand is safe.
 */
export async function runJobNow(actor: Actor, job: string): Promise<JobOutcome> {
  assertCan(actor.role, "settings:write");
  if (!(job in JOBS)) throw new ApiError(404, "UNKNOWN_JOB", `No job called "${job}"`);
  const limit = await rateLimit(`job-run:${actor.id}`, 10, 600);
  if (!limit.ok)
    throw new ApiError(
      429,
      "RATE_LIMITED",
      `Too many runs. Try again in ${Math.ceil(limit.retryAfter / 60)} min.`,
    );

  const run = await db.cronRun.create({ data: { job } });
  const started = Date.now();
  let ok = true;
  let result: unknown;
  try {
    result = await JOBS[job as JobName]();
    await db.cronRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), ok: true, result: result as Prisma.InputJsonValue },
    });
  } catch (e) {
    ok = false;
    result = { error: scrubSecrets(e instanceof Error ? e.message : String(e)) };
    await db.cronRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), ok: false, result: result as Prisma.InputJsonValue },
    });
  }
  const ms = Date.now() - started;
  await audit({
    actor,
    action: "cron.run_now",
    entity: "CronRun",
    entityId: run.id,
    after: { job, ok, ms },
  });
  return {
    job,
    ok,
    ms,
    message: `${ok ? "Finished" : "Failed"} in ${formatDuration(ms)}. ${summariseResult(result)}`,
  };
}
