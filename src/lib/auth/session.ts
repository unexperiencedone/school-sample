import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "./index";
import { db } from "@/lib/db";
import { assertCan, can, isStaff, type Permission } from "@/lib/rbac";

export type CurrentUser = { id: string; email: string; name: string | null; role: Role };

/** Reads the session and re-validates the user against the database (deactivated users lose access immediately). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, role: true, active: true },
  });
  if (!user?.active) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
});

/** For server components/pages: redirect to login when signed out, to /admin when lacking permission. */
export async function requireStaff(permission?: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isStaff(user.role)) redirect("/login?error=AccessDenied");
  if (permission && !can(user.role, permission)) redirect("/admin?denied=" + encodeURIComponent(permission));
  return user;
}

export async function requireRole(roles: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!roles.includes(user.role) && user.role !== "SUPER_ADMIN") redirect("/login?error=AccessDenied");
  return user;
}

/** For server actions: throws ForbiddenError instead of redirecting. */
export async function actionUser(permission?: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  if (permission) assertCan(user.role, permission);
  return user;
}
