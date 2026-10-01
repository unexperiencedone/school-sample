import "server-only";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { z } from "zod";
import { db } from "@/lib/db";
import { authConfig } from "./config";
import { verifyPassword } from "./password";
import { DEMO_USERS } from "./demo-users";
import { isDemoMode } from "@/config/school";
import { sendTemplate } from "@/lib/notify";

const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  providers: [
    Credentials({
      id: "credentials",
      name: "Email and password",
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const user = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
        if (!user?.passwordHash || !user.active) return null;
        if (!(await verifyPassword(user.passwordHash, parsed.data.password))) return null;
        await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
    Credentials({
      id: "demo",
      name: "Demo",
      credentials: { role: {} },
      async authorize(raw) {
        if (!isDemoMode()) return null;
        const demo = DEMO_USERS.find((d) => d.role === (raw as { role?: string })?.role);
        if (!demo) return null;
        const user = await db.user.findUnique({ where: { email: demo.email } });
        if (!user?.active) return null;
        await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
    {
      id: "magic-link",
      name: "Email link",
      type: "email",
      maxAge: 60 * 30,
      from: process.env.EMAIL_FROM ?? "hello@aurelia-sample.test",
      options: {},
      async sendVerificationRequest({ identifier, url }) {
        await sendTemplate({ template: "magic-link", to: { email: identifier }, data: { url } });
      },
    },
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      // Magic links only for accounts that already exist (parents, applicants, staff). No self sign-up.
      if (account?.provider === "magic-link") {
        const email = (user.email ?? "").toLowerCase();
        const existing = await db.user.findUnique({ where: { email } });
        return !!existing?.active;
      }
      return true;
    },
    async jwt(params) {
      const token = await authConfig.callbacks.jwt(params);
      if (params.user && !token.role && params.user.email) {
        const u = await db.user.findUnique({ where: { email: params.user.email.toLowerCase() } });
        if (u) {
          token.role = u.role;
          token.uid = u.id;
        }
      }
      return token;
    },
  },
  events: {
    async signIn({ user }) {
      if (user.id)
        await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => {});
    },
  },
});
