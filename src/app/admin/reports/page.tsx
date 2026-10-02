import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { PageHeader } from "@/components/crm/page-header";
import { reportHub } from "@/lib/services/reports";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportsHub() {
  const user = await requireStaff("reports:read");
  const hub = await reportHub(user);
  return (
    <>
      <PageHeader
        title="Reports"
        description={`Money, admissions and places at a glance for ${hub.year}. Each report can be filtered by year and date, and downloaded for Excel by those who may export.`}
      />
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {hub.cards.map((card) => (
          <li key={card.slug} className="min-w-0">
            <Link
              href={`/admin/reports/${card.slug}`}
              className="group flex h-full min-h-11 flex-col rounded-lg border border-line bg-elevated p-5 transition-colors hover:border-line-strong focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <h2 className="text-[0.95rem] font-semibold text-fg">{card.title}</h2>
              <p className="mt-1 text-sm text-muted">{card.description}</p>
              <p className="mt-4 text-[1.7rem] leading-none font-semibold tracking-tight text-fg">
                {card.headline.value}
              </p>
              <p className="mt-1.5 text-xs text-muted">{card.headline.label}</p>
              <span className="mt-4 inline-flex items-center gap-1 pt-1 text-sm font-medium text-primary">
                Open report
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
