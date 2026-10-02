import { ApiError, route } from "@/lib/api";
import { db } from "@/lib/db";
import { draftToMdx } from "@/lib/services/content-admin";

/** GET /api/admin/blog/[id]/mdx — the draft as an .mdx file for content/blog. */
export const GET = route<{ id: string }>(
  async (_req, { params, user }) => {
    const d = await db.blogDraft.findUnique({ where: { id: params.id } });
    if (!d) throw new ApiError(404, "NOT_FOUND", "Draft not found");
    return new Response(draftToMdx(d, user!.name ?? "Aurelia Hall"), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${d.slug}.mdx"`,
      },
    });
  },
  { permission: "content:write" },
);
