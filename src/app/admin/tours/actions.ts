"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionUser } from "@/lib/auth/session";
import { createSlots, setBookingStatus } from "@/lib/services/tours";
import type { ActionResult } from "../leads/actions";

export async function createSlotsAction(form: FormData): Promise<ActionResult> {
  const user = await actionUser("tours:write");
  const parsed = z
    .object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      days: z.coerce.number().int().min(1).max(31),
      times: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1),
      capacity: z.coerce.number().int().min(1).max(50),
      label: z.string().trim().min(2).max(80),
      skipSundays: z.boolean(),
    })
    .safeParse({
      from: form.get("from"),
      days: form.get("days"),
      times: form.getAll("times"),
      capacity: form.get("capacity"),
      label: form.get("label"),
      skipSundays: form.get("skipSundays") === "on",
    });
  if (!parsed.success) return { ok: false, error: "Check the dates, times and capacity" };
  const dates: string[] = [];
  const start = new Date(`${parsed.data.from}T00:00:00Z`);
  for (let i = 0; i < parsed.data.days; i++) {
    const d = new Date(start.getTime() + i * 86400_000);
    if (parsed.data.skipSundays && d.getUTCDay() === 0) continue;
    dates.push(d.toISOString().slice(0, 10));
  }
  try {
    const n = await createSlots(user, {
      dates,
      times: parsed.data.times,
      capacity: parsed.data.capacity,
      label: parsed.data.label,
    });
    revalidatePath("/admin/tours");
    return { ok: true, message: `${n} slot${n === 1 ? "" : "s"} created` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create slots" };
  }
}

export async function bookingStatusAction(bookingId: string, status: string): Promise<ActionResult> {
  const user = await actionUser("tours:write");
  const s = z.enum(["BOOKED", "CHECKED_IN", "NO_SHOW", "CANCELLED"]).parse(status);
  await setBookingStatus(user, bookingId, s);
  revalidatePath("/admin/tours");
  return { ok: true, message: "Updated" };
}
