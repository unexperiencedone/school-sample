import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { homeFor } from "@/lib/auth/home";

/** Sends each role to its home after a full-page sign-in (magic links land here). */
export async function GET(req: Request) {
  const session = await auth();
  return NextResponse.redirect(new URL(homeFor(session?.user?.role), req.url));
}
