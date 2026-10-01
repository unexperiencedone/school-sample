"use server";

import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { requestMeta } from "@/lib/request";
import { isDemoMode } from "@/config/school";

export type LoginState = { error?: string; sent?: boolean };

const safeCallback = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/login/continue";
};

export async function passwordLogin(_: LoginState, form: FormData): Promise<LoginState> {
  const { ip } = await requestMeta();
  const rl = await rateLimit(`login:${ip}`, 10, 300);
  if (!rl.ok) return { error: `Too many attempts. Try again in ${Math.ceil(rl.retryAfter / 60)} min.` };
  const parsed = z
    .object({ email: z.string().email(), password: z.string().min(1) })
    .safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Enter your email and password." };
  try {
    await signIn("credentials", { ...parsed.data, redirectTo: safeCallback(form.get("callbackUrl")) });
    return {};
  } catch (err) {
    if (err instanceof AuthError) return { error: "That email and password don't match an active account." };
    throw err;
  }
}

export async function magicLinkLogin(_: LoginState, form: FormData): Promise<LoginState> {
  const { ip } = await requestMeta();
  const rl = await rateLimit(`magic:${ip}`, 5, 600);
  if (!rl.ok) return { error: "Too many requests. Please wait a few minutes." };
  const email = z.string().email().safeParse(form.get("email"));
  if (!email.success) return { error: "Enter a valid email address." };
  try {
    await signIn("magic-link", {
      email: email.data.toLowerCase(),
      redirectTo: safeCallback(form.get("callbackUrl")),
    });
    return { sent: true };
  } catch (err) {
    // Don't reveal whether an account exists.
    if (err instanceof AuthError) return { sent: true };
    throw err;
  }
}

export async function demoLogin(form: FormData): Promise<void> {
  if (!isDemoMode()) throw new Error("Demo mode is off");
  await signIn("demo", { role: String(form.get("role")), redirectTo: "/login/continue" });
}
