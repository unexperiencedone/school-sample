import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { portalContext } from "@/lib/services/portal";
import { ActionForm } from "@/components/crm/action-form";
import { PrivacyButtons } from "@/components/portal/privacy-buttons";
import { Button } from "@/components/ui/button";
import { updateConsentAction } from "../actions";

export const metadata = { title: "Profile & privacy" };

export default async function Profile() {
  const user = await requireRole(["PARENT"]);
  const { guardian, children } = await portalContext(user);
  const requests = await db.dataRequest.findMany({
    where: { subjectEmail: user.email },
    orderBy: { createdAt: "desc" },
  });
  return (
    <>
      <p className="t-eyebrow">Profile & privacy</p>
      <h1 className="t-h1 mt-2 mb-8 text-primary">{guardian?.name ?? user.email}</h1>
      <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
        <section aria-labelledby="det-h" className="rounded-xl border border-line bg-elevated p-6 text-sm">
          <h2 id="det-h" className="mb-3 font-serif text-xl">
            Your details
          </h2>
          <dl className="space-y-2">
            {[
              ["Email", user.email],
              ["Mobile", guardian?.phone ?? "—"],
              ["Address", guardian?.address ?? "—"],
              ["Children", children.map((c) => `${c.firstName} (${c.class.name})`).join(", ") || "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-3">
                <dt className="w-24 shrink-0 text-muted">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-muted">
            To change these, send a{" "}
            <Link href="/portal/requests" className="underline">
              contact details request
            </Link>{" "}
            — the office verifies changes before they take effect.
          </p>
        </section>
        <section aria-labelledby="con-h" className="rounded-xl border border-line bg-elevated p-6 text-sm">
          <h2 id="con-h" className="mb-1 font-serif text-xl">
            How we contact you
          </h2>
          <p className="mb-4 text-muted">
            Fee receipts and safeguarding messages always reach you; these settings cover everything else.
          </p>
          {guardian && (
            <ActionForm action={updateConsentAction} className="space-y-3">
              {[
                ["email", "Email", guardian.emailOptIn],
                ["whatsapp", "WhatsApp", guardian.whatsappOptIn],
                ["sms", "SMS", guardian.smsOptIn],
              ].map(([name, label, on]) => (
                <label key={String(name)} className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    name={String(name)}
                    defaultChecked={Boolean(on)}
                    className="size-5"
                  />
                  {label}
                </label>
              ))}
              <Button type="submit" size="sm">
                Save preferences
              </Button>
            </ActionForm>
          )}
        </section>
        <section
          aria-labelledby="priv-h"
          className="rounded-xl border border-line bg-elevated p-6 text-sm lg:col-span-2"
        >
          <h2 id="priv-h" className="mb-1 font-serif text-xl">
            Your data
          </h2>
          <p className="mb-4 text-muted">
            Under India&apos;s Digital Personal Data Protection Act you can ask for a copy of the personal
            data the school holds about you, or ask for it to be corrected or erased. See the{" "}
            <Link href="/privacy" className="underline">
              privacy notice
            </Link>
            .
          </p>
          <PrivacyButtons />
          {requests.length > 0 && (
            <ul className="mt-4 space-y-1 text-muted">
              {requests.map((r) => (
                <li key={r.id}>
                  {r.kind === "EXPORT" ? "Copy of data" : "Erasure"} requested {formatDate(r.createdAt)} —{" "}
                  {r.status.toLowerCase()}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
