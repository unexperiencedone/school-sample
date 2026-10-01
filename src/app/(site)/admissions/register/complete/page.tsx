import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { db } from "@/lib/db";
import { STAGE_LABEL } from "@/lib/services/admissions";
import { ClearDraft } from "./clear-draft";

export const metadata = { title: "Registration complete", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function RegisterComplete({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  const app = ref
    ? await db.application.findUnique({
        where: { ref },
        select: { ref: true, stage: true, contactEmail: true, childFirstName: true },
      })
    : null;
  const done = app && app.stage !== "DRAFT";
  return (
    <section className="container-prose grid min-h-[60vh] place-items-center py-20 text-center">
      {done && <ClearDraft />}
      <div>
        <CheckCircle2 className={`mx-auto size-14 ${done ? "text-success" : "text-warning"}`} aria-hidden />
        <h1 className="t-h1 mt-4 text-primary">{done ? "Registration complete" : "Almost there"}</h1>
        {app && (
          <p className="mt-3 text-muted">
            {done
              ? `Thank you. ${app.childFirstName}'s application ${app.ref} is now: ${STAGE_LABEL[app.stage]}.`
              : `Application ${app.ref} is waiting for the registration fee.`}
          </p>
        )}
        {done && app && (
          <>
            <p className="mt-2 text-sm">
              We&apos;ve emailed a receipt and a sign-in link to {app.contactEmail}.
            </p>
            <div className="mt-8 flex justify-center gap-3">
              <Link
                href={`/login?email=${encodeURIComponent(app.contactEmail)}`}
                className="rounded-full bg-damson-800 px-6 py-3 font-semibold text-paper"
              >
                Track the application
              </Link>
              <Link href="/" className="rounded-full border border-line-strong px-6 py-3 font-semibold">
                Back to the website
              </Link>
            </div>
          </>
        )}
        {!done && (
          <Link
            href="/admissions/register"
            className="mt-8 inline-block rounded-full bg-damson-800 px-6 py-3 font-semibold text-paper"
          >
            Return to registration
          </Link>
        )}
      </div>
    </section>
  );
}
