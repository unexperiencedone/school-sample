import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { renderMdx } from "@/components/site/mdx";
import { SafePreview } from "@/components/crm/safe-preview";
import { PageHeader } from "@/components/crm/page-header";
import { ActionForm } from "@/components/crm/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { saveDraftAction } from "../actions";

export const metadata = { title: "Blog drafts" };

/**
 * Drafts are written here and previewed with the site's own renderer. Published posts are files in content/blog,
 * reviewed like code — "Ready" drafts download as the .mdx to commit.
 */
export default async function BlogDrafts({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  await requireStaff("content:write");
  const { id } = await searchParams;
  const drafts = await db.blogDraft.findMany({ orderBy: { updatedAt: "desc" } });
  const current = drafts.find((d) => d.id === id) ?? null;
  const preview = current ? await renderMdx(current.body, { trusted: false }).catch(() => null) : null;
  return (
    <>
      <PageHeader
        title="Blog drafts"
        description="Write and preview here. When a post is ready, download the .mdx and add it to content/blog — it goes live on the next deploy, after review."
      />
      <div className="grid items-start gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Drafts</CardTitle>
            <Link href="/admin/content/blog" className="text-xs text-primary underline">
              New
            </Link>
          </CardHeader>
          <ul className="divide-y divide-line text-sm">
            {drafts.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/admin/content/blog?id=${d.id}`}
                  aria-current={d.id === id ? "page" : undefined}
                  className="block px-5 py-3 hover:bg-sunken aria-[current=page]:bg-sunken"
                >
                  <span className="font-medium">{d.title}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                    <Badge tone={d.status === "READY" ? "success" : "neutral"}>
                      {d.status.toLowerCase()}
                    </Badge>{" "}
                    {formatDate(d.updatedAt, "d MMM")}
                  </span>
                </Link>
              </li>
            ))}
            {drafts.length === 0 && <li className="px-5 py-3 text-muted">No drafts yet.</li>}
          </ul>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>{current ? "Edit draft" : "New draft"}</CardTitle>
              {current?.status === "READY" && (
                <a
                  href={`/api/admin/blog/${current.id}/mdx`}
                  download
                  className="text-sm text-primary underline"
                >
                  Download .mdx
                </a>
              )}
            </CardHeader>
            <CardBody>
              <ActionForm
                key={current?.id ?? "new"}
                action={saveDraftAction.bind(null, current?.id ?? null)}
                className="space-y-3 text-sm"
                redirectTo={current ? undefined : "/admin/content/blog?id={id}"}
              >
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">Title</span>
                  <Input name="title" defaultValue={current?.title} required />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">
                    Description (shown in listings and search)
                  </span>
                  <Input name="excerpt" defaultValue={current?.excerpt} required />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">Body (Markdown)</span>
                  <Textarea
                    name="body"
                    defaultValue={current?.body}
                    rows={14}
                    required
                    className="font-mono text-[0.8rem]"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label>
                    <span className="mb-1 block text-xs text-muted">Tags (comma-separated)</span>
                    <Input name="tags" defaultValue={current?.tags.join(", ")} />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs text-muted">Status</span>
                    <Select name="status" defaultValue={current?.status ?? "DRAFT"}>
                      <option value="DRAFT">Draft</option>
                      <option value="READY">Ready to publish</option>
                    </Select>
                  </label>
                </div>
                <Button type="submit" size="sm">
                  Save
                </Button>
              </ActionForm>
            </CardBody>
          </Card>
          {preview && (
            <Card>
              <CardHeader>
                <CardTitle>Preview</CardTitle>
              </CardHeader>
              <CardBody className="prose-school max-w-none">
                <SafePreview>{preview}</SafePreview>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
