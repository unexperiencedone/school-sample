import "server-only";
import type { EventKind, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { slugify } from "@/lib/utils";
import { sendTemplate } from "@/lib/notify";

type Actor = { id: string; role: Role };

export async function saveBarItem(
  actor: Actor,
  id: string | null,
  input: {
    title: string;
    body: string;
    href: string | null;
    active: boolean;
    order: number;
    expiresAt: Date | null;
  },
) {
  assertCan(actor.role, "content:write");
  if (input.href && !/^(\/|https:\/\/)/.test(input.href))
    throw new ApiError(422, "VALIDATION", "Links must start with / or https://");
  const row = id
    ? await db.announcement.update({ where: { id }, data: input })
    : await db.announcement.create({ data: { ...input, kind: "BAR", createdById: actor.id } });
  await audit({
    actor,
    action: id ? "announcement.update" : "announcement.create",
    entity: "Announcement",
    entityId: row.id,
    after: input,
  });
  return row;
}

export async function saveEvent(
  actor: Actor,
  id: string | null,
  input: {
    title: string;
    kind: EventKind;
    summary: string;
    location: string;
    startsAt: Date;
    endsAt: Date;
    published: boolean;
    showInModal: boolean;
  },
) {
  assertCan(actor.role, "content:write");
  if (input.endsAt <= input.startsAt)
    throw new ApiError(422, "VALIDATION", "An event must end after it starts.");
  return db.$transaction(async (tx) => {
    // Only one event may drive the website's pop-up at a time
    if (input.showInModal)
      await tx.event.updateMany({
        where: { showInModal: true, ...(id ? { id: { not: id } } : {}) },
        data: { showInModal: false },
      });
    const row = id
      ? await tx.event.update({ where: { id }, data: input })
      : await tx.event.create({
          data: { ...input, slug: `${slugify(input.title)}-${input.startsAt.toISOString().slice(0, 10)}` },
        });
    await audit(
      {
        actor,
        action: id ? "event.update" : "event.create",
        entity: "Event",
        entityId: row.id,
        after: input,
      },
      tx,
    );
    return row;
  });
}

export async function saveBlogDraft(
  actor: Actor,
  id: string | null,
  input: { title: string; excerpt: string; body: string; tags: string[]; status: "DRAFT" | "READY" },
) {
  assertCan(actor.role, "content:write");
  const slug = slugify(input.title);
  if (!slug) throw new ApiError(422, "VALIDATION", "Give the post a title.");
  const clash = await db.blogDraft.findFirst({ where: { slug, ...(id ? { id: { not: id } } : {}) } });
  if (clash) throw new ApiError(409, "SLUG_TAKEN", "Another draft already uses this title.");
  const row = id
    ? await db.blogDraft.update({ where: { id }, data: { ...input, slug } })
    : await db.blogDraft.create({ data: { ...input, slug } });
  await audit({
    actor,
    action: id ? "blog_draft.update" : "blog_draft.create",
    entity: "BlogDraft",
    entityId: row.id,
    after: { title: input.title, status: input.status },
  });
  return row;
}

/** The .mdx file a writer commits to `content/blog/` to publish a draft (posts are files, reviewed like code). */
export function draftToMdx(
  d: { title: string; excerpt: string; body: string; tags: string[]; slug: string },
  author: string,
) {
  // Same front matter as the posts in content/blog (see docs/CONTENT_GUIDE.md)
  const fm = [
    "---",
    `title: ${JSON.stringify(d.title)}`,
    `description: ${JSON.stringify(d.excerpt)}`,
    `date: ${new Date().toISOString().slice(0, 10)}`,
    `author: ${JSON.stringify(author)}`,
    `tags: [${d.tags.join(", ")}]`,
    `image: /images/blog-1.webp`,
    `imageAlt: ${JSON.stringify(d.title)}`,
    "---",
    "",
  ].join("\n");
  return fm + d.body.trim() + "\n";
}

export type Audience = "ALL" | "BOARDERS" | `CLASS:${string}`;

/** Publishes a circular to the portal and sends it to every parent in the audience who accepts that channel. */
export async function sendCircular(
  actor: Actor,
  input: { title: string; body: string; audience: Audience; whatsapp: boolean },
) {
  assertCan(actor.role, "comms:send");
  if (input.title.trim().length < 4 || input.body.trim().length < 20)
    throw new ApiError(422, "VALIDATION", "Write a title and a few sentences.");
  const studentFilter =
    input.audience === "ALL"
      ? {}
      : input.audience === "BOARDERS"
        ? { boardingType: { in: ["FULL", "FLEXI"] as ("FULL" | "FLEXI")[] } }
        : { classId: input.audience.slice(6) };
  const guardians = await db.guardian.findMany({
    where: { students: { some: { isPrimary: true, student: { status: "ACTIVE", ...studentFilter } } } },
  });
  const circular = await db.announcement.create({
    data: { kind: "CIRCULAR", title: input.title.trim(), body: input.body.trim(), createdById: actor.id },
  });
  let sent = 0;
  for (const g of guardians) {
    const ids = await sendTemplate({
      template: "circular",
      to: {
        email: g.email,
        phone: g.phone,
        consent: { email: g.emailOptIn, whatsapp: g.whatsappOptIn, sms: g.smsOptIn },
      },
      data: { title: circular.title, body: circular.body },
      channels: input.whatsapp ? ["EMAIL", "WHATSAPP"] : ["EMAIL"],
      related: { type: "circular", id: circular.id },
    });
    sent += ids.length;
  }
  await audit({
    actor,
    action: "circular.send",
    entity: "Announcement",
    entityId: circular.id,
    after: { audience: input.audience, families: guardians.length, messages: sent },
  });
  return { families: guardians.length, messages: sent };
}
