"use server";

import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import type { EventKind } from "@prisma/client";
import { actionUser } from "@/lib/auth/session";
import {
  saveBarItem,
  saveBlogDraft,
  saveEvent,
  sendCircular,
  type Audience,
} from "@/lib/services/content-admin";

type Result = { ok: true; message?: string; id?: string } | { ok: false; error: string };
async function run(fn: () => Promise<{ message: string; id?: string }>, paths: string[]): Promise<Result> {
  try {
    const r = await fn();
    paths.forEach((p) => revalidatePath(p));
    revalidatePath("/", "layout"); // the public site's announcement bar and event pop-up
    return { ok: true, ...r };
  } catch (e) {
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form" };
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}
const str = (min: number, max: number, msg = "Required") => z.string().trim().min(min, msg).max(max);
const dt = z
  .string()
  .min(1, "Choose a date and time")
  .transform((v) => new Date(`${v}:00+05:30`));

export async function saveBarAction(id: string | null, form: FormData): Promise<Result> {
  const user = await actionUser("content:write");
  return run(async () => {
    const expires = String(form.get("expiresAt") ?? "");
    await saveBarItem(user, id, {
      title: str(2, 60, "Add a short title").parse(form.get("title")),
      body: str(4, 160, "Add the message (up to 160 characters)").parse(form.get("body")),
      href: String(form.get("href") ?? "").trim() || null,
      active: form.get("active") === "on",
      order: z.coerce
        .number()
        .int()
        .min(0)
        .max(99)
        .parse(form.get("order") ?? 0),
      expiresAt: expires ? new Date(`${expires}T23:59:59+05:30`) : null,
    });
    return { message: id ? "Saved — live on the website now" : "Added to the announcement bar" };
  }, ["/admin/content"]);
}

export async function saveEventAction(id: string | null, form: FormData): Promise<Result> {
  const user = await actionUser("content:write");
  return run(async () => {
    const e = await saveEvent(user, id, {
      title: str(3, 100).parse(form.get("title")),
      kind: z
        .enum(["OPEN_HOUSE", "CAMPUS_TOUR", "SCHOOL_EVENT", "ADMISSIONS_TALK"])
        .parse(form.get("kind")) as EventKind,
      summary: str(10, 300, "Write a one or two sentence summary").parse(form.get("summary")),
      location: str(2, 100).parse(form.get("location")),
      startsAt: dt.parse(form.get("startsAt")),
      endsAt: dt.parse(form.get("endsAt")),
      published: form.get("published") === "on",
      showInModal: form.get("showInModal") === "on",
    });
    return { message: "Event saved", id: e.id };
  }, ["/admin/content/events", "/events"]);
}

export async function saveDraftAction(id: string | null, form: FormData): Promise<Result> {
  const user = await actionUser("content:write");
  return run(async () => {
    const d = await saveBlogDraft(user, id, {
      title: str(4, 120).parse(form.get("title")),
      excerpt: str(10, 240, "Write a short description").parse(form.get("excerpt")),
      body: str(20, 50_000, "Write the post").parse(form.get("body")),
      tags: String(form.get("tags") ?? "")
        .split(",")
        .map((t) => t.trim().toLowerCase().replace(/\s+/g, "-"))
        .filter(Boolean)
        .slice(0, 6),
      status: form.get("status") === "READY" ? "READY" : "DRAFT",
    });
    return {
      message: d.status === "READY" ? "Marked ready — download the .mdx to publish" : "Draft saved",
      id: d.id,
    };
  }, ["/admin/content/blog"]);
}

export async function sendCircularAction(form: FormData): Promise<Result> {
  const user = await actionUser("comms:send");
  return run(async () => {
    const audience = z
      .string()
      .regex(/^(ALL|BOARDERS|CLASS:.+)$/)
      .parse(form.get("audience")) as Audience;
    const r = await sendCircular(user, {
      title: str(4, 120).parse(form.get("title")),
      body: str(20, 10_000, "Write a few sentences").parse(form.get("body")),
      audience,
      whatsapp: form.get("whatsapp") === "on",
    });
    return { message: `Published to the portal and sent to ${r.families} families (${r.messages} messages)` };
  }, ["/admin/comms", "/portal/circulars", "/admin/outbox"]);
}
