"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { LeadStatus } from "@prisma/client";
import { actionUser } from "@/lib/auth/session";
import {
  addLeadNote,
  addReminder,
  bulkUpdateLeads,
  mergeLeads,
  updateLead,
} from "@/lib/services/leads-admin";
import { LEAD_STATUS_FLOW } from "@/lib/services/leads";
import { db } from "@/lib/db";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

async function run(fn: () => Promise<string | void>, paths: string[]): Promise<ActionResult> {
  try {
    const message = await fn();
    paths.forEach((p) => revalidatePath(p));
    return { ok: true, message: message ?? undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

const statusEnum = z.enum(LEAD_STATUS_FLOW as [LeadStatus, ...LeadStatus[]]);

export async function setLeadStatus(id: string, status: string, lostReason?: string): Promise<ActionResult> {
  const user = await actionUser("leads:write");
  return run(async () => {
    await updateLead(user, id, {
      status: statusEnum.parse(status),
      lostReason: lostReason?.trim() || undefined,
    });
  }, ["/admin/leads", `/admin/leads/${id}`, "/admin/leads/pipeline"]);
}

export async function assignLead(id: string, userId: string | null): Promise<ActionResult> {
  const user = await actionUser("leads:assign");
  return run(async () => {
    await updateLead(user, id, { assignedToId: userId });
  }, ["/admin/leads", `/admin/leads/${id}`]);
}

export async function noteLead(id: string, form: FormData): Promise<ActionResult> {
  const user = await actionUser("leads:write");
  const body = z.string().trim().min(1, "Write a note").max(2000).safeParse(form.get("body"));
  if (!body.success) return { ok: false, error: body.error.issues[0]!.message };
  const kind = z.enum(["NOTE", "CALL", "EMAIL"]).catch("NOTE").parse(form.get("kind"));
  return run(async () => {
    await addLeadNote(user, id, body.data, kind);
  }, [`/admin/leads/${id}`]);
}

export async function remindLead(id: string, form: FormData): Promise<ActionResult> {
  const user = await actionUser("leads:write");
  const parsed = z
    .object({ title: z.string().trim().min(2).max(200), dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
    .safeParse({ title: form.get("title"), dueAt: form.get("dueAt") });
  if (!parsed.success) return { ok: false, error: "Give the reminder a title and a date" };
  return run(async () => {
    await addReminder(user, id, parsed.data.title, new Date(`${parsed.data.dueAt}T09:00:00+05:30`));
  }, [`/admin/leads/${id}`, "/admin/leads/reminders"]);
}

export async function completeReminder(reminderId: string): Promise<ActionResult> {
  const user = await actionUser("leads:write");
  return run(async () => {
    // Any admissions user may close a team reminder; who closed it is recorded on the lead timeline.
    const r = await db.reminder.update({ where: { id: reminderId }, data: { doneAt: new Date() } });
    if (r.leadId)
      await db.leadActivity.create({
        data: { leadId: r.leadId, actorId: user.id, kind: "NOTE", body: `Reminder done: ${r.title}` },
      });
  }, ["/admin/leads/reminders", "/admin"]);
}

export async function bulkLeads(
  ids: string[],
  patch: { status?: string; assignedToId?: string | null },
): Promise<ActionResult> {
  const user = await actionUser(patch.assignedToId !== undefined ? "leads:assign" : "leads:write");
  return run(async () => {
    const n = await bulkUpdateLeads(user, z.array(z.string()).max(500).parse(ids), {
      status: patch.status ? statusEnum.parse(patch.status) : undefined,
      assignedToId: patch.assignedToId,
    });
    return `Updated ${n} lead${n === 1 ? "" : "s"}`;
  }, ["/admin/leads", "/admin/leads/pipeline"]);
}

export async function mergeLeadAction(keepId: string, mergeIds: string[]): Promise<ActionResult> {
  const user = await actionUser("leads:merge");
  return run(async () => {
    await mergeLeads(user, keepId, mergeIds);
    return "Leads merged";
  }, ["/admin/leads", `/admin/leads/${keepId}`]);
}
