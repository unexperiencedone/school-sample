import { db } from "@/lib/db";
import { devToolsEnabled } from "@/lib/dev-tools";

export const dynamic = "force-dynamic";

/** GET /api/dev/outbox/[id] — renders one mock email (dev/demo only). Sandboxed via CSP. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!devToolsEnabled()) return new Response("Not found", { status: 404 });
  const row = await db.outbox.findUnique({ where: { id: (await params).id } });
  if (!row) return new Response("Not found", { status: 404 });
  const html = row.channel === "EMAIL" ? row.body : `<pre>${row.body.replace(/</g, "&lt;")}</pre>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; sandbox allow-top-navigation-by-user-activation allow-popups",
      "Cache-Control": "no-store",
    },
  });
}
