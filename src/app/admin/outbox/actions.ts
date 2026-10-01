"use server";

import { revalidatePath } from "next/cache";
import { actionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { dispatch } from "@/lib/notify";
import type { ActionResult } from "../leads/actions";

export async function retryOutboxAction(id: string): Promise<ActionResult> {
  await actionUser("comms:send");
  const row = await db.outbox.findUniqueOrThrow({ where: { id } });
  if (row.status !== "FAILED") return { ok: false, error: "Only failed messages can be retried" };
  await dispatch(id);
  revalidatePath("/admin/outbox");
  revalidatePath(`/admin/outbox/${id}`);
  const after = await db.outbox.findUniqueOrThrow({ where: { id } });
  return after.status === "SENT"
    ? { ok: true, message: "Sent" }
    : { ok: false, error: after.lastError ?? "Still failing" };
}
