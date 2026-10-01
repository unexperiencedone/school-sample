import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth/config";

const { auth } = NextAuth(authConfig);

/** Coarse route protection (edge). Fine-grained RBAC is enforced again on the server for every action. */
export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const protectedArea = ["/admin", "/portal", "/applicant"].some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  if (protectedArea && !req.auth?.user) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", pathname + search);
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  // Private areas are never indexed.
  if (
    protectedArea ||
    pathname.startsWith("/mock-pay") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/apply")
  ) {
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return res;
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|images|fonts|favicon.ico|robots.txt|sitemap.xml).*)"],
};
