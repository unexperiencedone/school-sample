import type { Role } from "@prisma/client";
import { isStaff } from "@/lib/rbac";

/** Where each role lands after signing in. */
export function homeFor(role: Role | null | undefined): string {
  if (!role) return "/login";
  return isStaff(role) ? "/admin" : role === "PARENT" ? "/portal" : "/applicant";
}
