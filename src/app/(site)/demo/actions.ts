"use server";

import { redirect } from "next/navigation";
import { actionUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { isDemoMode } from "@/config/school";
import { loadSnapshot, withClient } from "@/lib/demo/load-snapshot.mjs";

/** Puts the sample school back exactly as it was shipped (super admin, demo mode only). */
export async function resetDemo(): Promise<void> {
  if (!isDemoMode()) throw new Error("Demo mode is off");
  const user = await actionUser("demo:reset");
  const url =
    process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  await withClient(url, loadSnapshot);
  // Recorded without an actor id: the reload replaces every user, so the old id may no longer exist
  await audit({
    actor: null,
    action: "demo.reset",
    entity: "Demo",
    after: { by: user.email, role: user.role },
  });
  redirect("/demo?reset=1");
}
