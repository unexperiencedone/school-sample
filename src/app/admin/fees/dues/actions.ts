"use server";

import { revalidatePath } from "next/cache";
import { actionUser } from "@/lib/auth/session";
import { remindNow } from "@/lib/services/dues";

export async function remindAction(
  instalmentId: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const user = await actionUser("comms:send");
    const who = await remindNow(user, instalmentId);
    revalidatePath("/admin/fees/dues");
    return { ok: true, message: `Reminder sent to ${who}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not send" };
  }
}
