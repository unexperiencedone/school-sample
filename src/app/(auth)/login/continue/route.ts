import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isStaff } from "@/lib/rbac";

/** Sends each role to its home after sign-in. */
export async function GET(req: Request) {
  const session = await auth();
  const role = session?.user?.role;
  const dest = !role ? "/login" : isStaff(role) ? "/admin" : role === "PARENT" ? "/portal" : "/applicant";
  return NextResponse.redirect(new URL(dest, req.url));
}
