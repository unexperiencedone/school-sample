import { isDemoMode } from "@/config/school";

/** Developer/demo helpers (outbox feed, demo reset) exist only outside production or in demo mode. Never enable demo mode for a real school. */
export function devToolsEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || isDemoMode();
}
