"use server";

import { redirect } from "next/navigation";
import { actionUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { isDemoMode } from "@/config/school";
import { rateLimit } from "@/lib/rate-limit";
import { isSnapshotLoaded, loadSnapshot, withClient } from "@/lib/demo/load-snapshot.mjs";

/** Puts the sample school back exactly as it was shipped (super admin, demo mode only). */
export async function resetDemo(): Promise<void> {
  if (!isDemoMode()) throw new Error("Demo mode is off");
  const user = await actionUser("demo:reset");
  const url =
    process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // A wipe-and-reload is heavy (it locks every table), and in demo mode anyone can sign in as the super admin
  const rl = await rateLimit("demo-reset", 1, 60);
  if (!rl.ok) throw new Error(`The demo was just reset. Try again in ${rl.retryAfter} seconds.`);
  await withClient(url, async (client) => {
    // Only a database that was itself loaded as the demo school may be reset
    if (!(await isSnapshotLoaded(client))) throw new Error("This database is not marked as the demo school.");
    await loadSnapshot(client);
  });
  // The reload emptied the rate-limit table too; record this reset again so the cooldown holds
  await rateLimit("demo-reset", 1, 60);
  // Recorded without an actor id: the reload replaces every user, so the old id may no longer exist
  await audit({
    actor: null,
    action: "demo.reset",
    entity: "Demo",
    after: { by: user.email, role: user.role },
  });
  redirect("/demo?reset=1");
}
