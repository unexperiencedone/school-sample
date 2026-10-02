import Link from "next/link";
import { FileText } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { selectChild } from "@/lib/services/portal";
import { ChildHeader, NoChildren } from "@/components/portal/child-card";

export const metadata = { title: "Documents" };

function Doc({ href, title, meta }: { href: string; title: string; meta: string }) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        className="flex items-center gap-3 rounded-lg border border-line bg-elevated px-4 py-3 hover:bg-sunken"
      >
        <FileText className="size-5 shrink-0 text-muted" aria-hidden />
        <span className="min-w-0">
          <span className="block truncate font-medium">{title}</span>
          <span className="block text-xs text-muted">{meta}</span>
        </span>
      </a>
    </li>
  );
}

/** Every document the school has issued for this child, plus the school's published policies. */
export default async function Documents({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const user = await requireRole(["PARENT"]);
  const { child } = await selectChild(user, (await searchParams).child);
  if (!child) return <NoChildren />;
  const [invoices, receipts] = await Promise.all([
    db.invoice.findMany({
      where: { studentId: child.id, status: { not: "VOID" } },
      include: { year: true },
      orderBy: { issuedAt: "desc" },
    }),
    db.receipt.findMany({
      where: { payment: { studentId: child.id } },
      include: { payment: true },
      orderBy: { issuedAt: "desc" },
      take: 30,
    }),
  ]);
  return (
    <>
      <ChildHeader child={child} title="Documents" />
      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="inv-h">
          <h2 id="inv-h" className="mb-3 font-serif text-xl">
            Invoices
          </h2>
          <ul className="space-y-2">
            {invoices.map((i) => (
              <Doc
                key={i.id}
                href={`/api/invoices/${i.id}/pdf`}
                title={`${i.year.name} fee invoice`}
                meta={`${i.number} · ${formatINR(i.totalPaise)}`}
              />
            ))}
          </ul>
        </section>
        <section aria-labelledby="rec-h">
          <h2 id="rec-h" className="mb-3 font-serif text-xl">
            Receipts
          </h2>
          <ul className="space-y-2">
            {receipts.map((r) => (
              <Doc
                key={r.id}
                href={`/api/receipts/${r.id}`}
                title={`Receipt ${r.number}`}
                meta={`${formatINR(r.amountPaise)} · ${formatDate(r.issuedAt)}`}
              />
            ))}
          </ul>
        </section>
        <section aria-labelledby="pol-h">
          <h2 id="pol-h" className="mb-3 font-serif text-xl">
            School policies
          </h2>
          <ul className="space-y-2">
            <Doc
              href="/api/fees/pdf?boarding=FULL,FLEXI,DAY"
              title="Fee schedule"
              meta="Current published fees, plans and refund policy"
            />
          </ul>
          <p className="mt-3 text-sm text-muted">
            Handbooks and forms are in{" "}
            <Link href="/resources" className="underline">
              Resources
            </Link>
            .
          </p>
        </section>
      </div>
    </>
  );
}
