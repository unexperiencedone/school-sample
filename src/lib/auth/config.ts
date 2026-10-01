import type { NextAuthConfig } from "next-auth";
import type { Role } from "@prisma/client";

/**
 * Edge-safe Auth.js config (no Prisma, no argon2). Used by middleware.
 * The full config with providers and adapter lives in ./index.ts.
 */
const STAFF = [
  "SUPER_ADMIN",
  "PRINCIPAL",
  "ADMISSIONS",
  "ACCOUNTS",
  "REGISTRAR",
  "TEACHER",
  "HOUSEPARENT",
  "HR",
];

export const authConfig = {
  pages: { signIn: "/login", verifyRequest: "/login/check-email", error: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id!;
        token.role = (user as { role?: Role }).role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const role = auth?.user?.role;
      if (pathname.startsWith("/admin")) return !!role && STAFF.includes(role);
      if (pathname.startsWith("/portal")) return role === "PARENT" || role === "SUPER_ADMIN";
      if (pathname.startsWith("/applicant")) return role === "APPLICANT" || role === "SUPER_ADMIN";
      return true;
    },
  },
} satisfies NextAuthConfig;
