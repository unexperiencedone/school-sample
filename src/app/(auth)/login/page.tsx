import Link from "next/link";
import { DEMO_USERS } from "@/lib/auth/demo-users";
import { isDemoMode } from "@/config/school";
import { LoginForms } from "./login-forms";
import { demoLogin } from "./actions";

export const metadata = { title: "Sign in", robots: { index: false, follow: false } };

const ERRORS: Record<string, string> = {
  AccessDenied: "That account can't open this area. Sign in with a different account.",
  Verification: "That sign-in link has expired or was already used. Request a new one.",
  Configuration: "Sign-in is temporarily unavailable.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const showDemo = isDemoMode() && (sp.demo === "1" || sp.demo === "true");
  return (
    <>
      <p className="t-eyebrow">Staff, parents & applicants</p>
      <h1 className="t-h1 mt-2 text-primary">Sign in</h1>
      {sp.error && (
        <p role="alert" className="mt-5 rounded-md bg-danger-bg px-4 py-3 text-sm text-danger">
          {ERRORS[sp.error] ?? "Sign-in failed. Please try again."}
        </p>
      )}

      {showDemo ? (
        <section aria-labelledby="demo-h" className="mt-8">
          <h2 id="demo-h" className="text-sm font-semibold text-fg">
            Demo accounts <span className="font-normal text-muted">— one click, no password</span>
          </h2>
          <ul className="mt-4 grid gap-2">
            {DEMO_USERS.map((d) => (
              <li key={d.role}>
                <form action={demoLogin}>
                  <input type="hidden" name="role" value={d.role} />
                  <button
                    type="submit"
                    data-testid={`demo-${d.role.toLowerCase()}`}
                    className="group flex w-full items-center justify-between rounded-md border border-line bg-elevated px-4 py-3 text-left transition-colors hover:border-primary hover:bg-damson-50"
                  >
                    <span>
                      <span className="block font-medium text-fg">{d.label}</span>
                      <span className="block text-xs text-muted">{d.blurb}</span>
                    </span>
                    <span
                      aria-hidden
                      className="text-kiln-700 transition-transform group-hover:translate-x-1"
                    >
                      →
                    </span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <Link href="/login" className="mt-6 inline-block text-sm text-muted underline">
            Use a real sign-in instead
          </Link>
        </section>
      ) : (
        <LoginForms callbackUrl={sp.callbackUrl} defaultEmail={sp.email} demo={isDemoMode()} />
      )}
    </>
  );
}
