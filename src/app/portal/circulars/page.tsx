import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/dates";

export const metadata = { title: "Circulars" };

export default async function Circulars() {
  await requireRole(["PARENT"]);
  const circulars = await db.announcement.findMany({
    where: { kind: "CIRCULAR", active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    orderBy: { publishedAt: "desc" },
    take: 50,
  });
  return (
    <>
      <p className="t-eyebrow">Circulars</p>
      <h1 className="t-h1 mt-2 mb-8 text-primary">From the school</h1>
      <div className="max-w-3xl space-y-4">
        {circulars.map((c) => (
          <article
            key={c.id}
            id={c.id}
            className="scroll-mt-24 rounded-xl border border-line bg-elevated p-6"
          >
            <p className="text-sm text-muted">{formatDate(c.publishedAt, "EEEE d MMMM yyyy")}</p>
            <h2 className="mt-1 font-serif text-xl">{c.title}</h2>
            <div className="mt-3 space-y-3 text-[0.95rem] leading-relaxed whitespace-pre-line">{c.body}</div>
            {c.href && (
              <a href={c.href} className="mt-3 inline-block text-sm underline">
                More details
              </a>
            )}
          </article>
        ))}
        {circulars.length === 0 && <p className="text-muted">No circulars yet.</p>}
      </div>
    </>
  );
}
