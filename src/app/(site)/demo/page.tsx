import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isDemoMode } from "@/config/school";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { MOMENTS } from "@/lib/demo/moments";
import { demoLogin } from "@/app/(auth)/login/actions";
import { DoneToggle } from "./done-toggle";
import { ResetButton } from "./reset-button";

export const metadata: Metadata = {
  title: "Guided demo",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export const maxDuration = 60; // the Reset action runs under this route's limit

const btn =
  "inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition-colors";

function Start({ role, to, label }: { role: string | null; to: string; label: string }) {
  if (!role)
    return (
      <Link href={to} className={`${btn} bg-primary text-white hover:bg-damson-800`}>
        {label}
      </Link>
    );
  return (
    <form action={demoLogin}>
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="to" value={to} />
      <button type="submit" className={`${btn} bg-primary text-white hover:bg-damson-800`}>
        {label}
      </button>
    </form>
  );
}

/** Ten moments that show what the school gets, each one click from the right screen with the right person signed in. */
export default async function DemoPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  if (!isDemoMode()) notFound();
  const user = await getCurrentUser();
  const sp = await searchParams;
  // The sample data is dated to the day it was loaded; say so when that was a while ago
  const marker = await db.setting.findUnique({ where: { key: "demo_snapshot" } });
  const anchor = (marker?.value as { anchor?: string } | null)?.anchor;
  const staleDays = anchor ? Math.floor((Date.now() - Date.parse(`${anchor}T00:00:00Z`)) / 86400e3) : 0;
  return (
    <div className="container-site max-w-4xl py-16">
      <p className="t-eyebrow">Sample build</p>
      <h1 className="t-h1 mt-2 text-primary">Ten moments worth showing</h1>
      <p className="mt-4 max-w-2xl text-lg text-muted">
        A public website, a school CRM and a parent portal, running on a fictional school with a year of
        believable data. Each card signs you in as the right person and opens the right screen. Everything
        uses mock payments and an outbox instead of real email, WhatsApp or SMS.
      </p>
      {staleDays > 14 && anchor && (
        <p role="note" className="mt-6 rounded-md bg-sunken px-4 py-3 text-sm">
          The sample data is dated {formatDate(`${anchor}T00:00:00Z`)}, {staleDays} days ago, so due dates and
          &ldquo;this month&rdquo; figures will look old. The Super admin can bring it up to today with{" "}
          <em>Reset the sample school</em> below.
        </p>
      )}
      {sp.reset && (
        <p role="status" className="mt-6 rounded-md bg-success-bg px-4 py-3 text-sm text-success">
          The sample school has been reset to its starting state.
        </p>
      )}
      <ol className="mt-10 space-y-5">
        {MOMENTS.map((m) => (
          <li key={m.n}>
            <article
              aria-labelledby={`m${m.n}`}
              className="rounded-xl border border-line bg-elevated p-6 sm:p-7"
            >
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-muted">
                    Moment {m.n} · {m.roleLabel}
                  </p>
                  <h2 id={`m${m.n}`} className="mt-1 font-serif text-2xl text-fg">
                    {m.title}
                  </h2>
                </div>
                <DoneToggle n={m.n} title={m.title} />
              </header>
              <p className="mt-3 text-[0.95rem] leading-relaxed">{m.say}</p>
              <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-muted">
                {m.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <div className="mt-5 flex flex-wrap gap-3">
                <Start
                  role={m.role}
                  to={m.start}
                  label={m.role ? `Start as ${m.roleLabel.split(",")[0]}` : "Start"}
                />
                {m.then && <Start role={m.then.role} to={m.then.to} label={m.then.label} />}
              </div>
            </article>
          </li>
        ))}
      </ol>
      <section
        aria-labelledby="reset-h"
        className="mt-12 rounded-xl border border-dashed border-line-strong p-6"
      >
        <h2 id="reset-h" className="font-serif text-xl">
          Start fresh
        </h2>
        <p className="mt-2 text-sm text-muted">
          Done a run-through? The super admin can put the sample school back exactly as shipped (about ten
          seconds). Everything entered during the demo is removed.
        </p>
        {user && can(user.role, "demo:reset") ? (
          <div className="mt-4">
            <ResetButton className={`${btn} border border-line-strong hover:bg-sunken`} />
          </div>
        ) : (
          <p className="mt-4 text-sm">
            Sign in as the{" "}
            <Link href="/login?demo=1" className="underline">
              Super admin
            </Link>{" "}
            to reset.
          </p>
        )}
      </section>
    </div>
  );
}
