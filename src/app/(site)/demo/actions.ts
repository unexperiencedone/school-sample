"use server";

import { redirect } from "next/navigation";
import { actionUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { isDemoMode } from "@/config/school";
import { loadSnapshot, withClient } from "@/lib/demo/load-snapshot.mjs";

export const maxDuration = 60;

/** Puts the sample school back exactly as it was shipped (super admin, demo mode only). */
export async function resetDemo(): Promise<void> {
  if (!isDemoMode()) throw new Error("Demo mode is off");
  const user = await actionUser("demo:reset");
  const url =
    process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  await withClient(url, loadSnapshot);
  await audit({ actor: { id: user.id, role: user.role }, action: "demo.reset", entity: "Demo" });
  redirect("/demo?reset=1");
}
