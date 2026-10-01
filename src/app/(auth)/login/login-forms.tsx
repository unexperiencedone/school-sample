"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { magicLinkLogin, passwordLogin, type LoginState } from "./actions";

export function LoginForms({
  callbackUrl,
  defaultEmail,
  demo,
}: {
  callbackUrl?: string;
  defaultEmail?: string;
  demo: boolean;
}) {
  const [pw, pwAction, pwPending] = useActionState<LoginState, FormData>(passwordLogin, {});
  const [ml, mlAction, mlPending] = useActionState<LoginState, FormData>(magicLinkLogin, {});

  return (
    <div className="mt-8">
      <Tabs defaultValue={defaultEmail ? "link" : "password"}>
        <TabsList className="w-full">
          <TabsTrigger value="password" className="flex-1">
            Password
          </TabsTrigger>
          <TabsTrigger value="link" className="flex-1">
            Email me a link
          </TabsTrigger>
        </TabsList>

        <TabsContent value="password">
          <form action={pwAction} className="space-y-4">
            <input type="hidden" name="callbackUrl" value={callbackUrl ?? ""} />
            <Field id="email" label="Email" required>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </Field>
            <Field id="password" label="Password" required>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </Field>
            {pw.error && (
              <p role="alert" className="text-danger text-sm">
                {pw.error}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={pwPending}>
              {pwPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="link">
          {ml.sent ? (
            <p className="bg-success-bg text-success rounded-md px-4 py-3 text-sm" role="status">
              If an account exists for that address, a sign-in link is on its way.
            </p>
          ) : (
            <form action={mlAction} className="space-y-4">
              <input type="hidden" name="callbackUrl" value={callbackUrl ?? ""} />
              <Field
                id="ml-email"
                label="Email"
                required
                hint="Parents and applicants: use the email you registered with."
              >
                <Input
                  id="ml-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  defaultValue={defaultEmail}
                  required
                />
              </Field>
              {ml.error && (
                <p role="alert" className="text-danger text-sm">
                  {ml.error}
                </p>
              )}
              <Button type="submit" size="lg" className="w-full" disabled={mlPending}>
                {mlPending ? "Sending…" : "Send sign-in link"}
              </Button>
            </form>
          )}
        </TabsContent>
      </Tabs>
      {demo && (
        <p className="border-marigold-500 bg-marigold-100/60 text-marigold-700 mt-8 rounded-md border border-dashed px-4 py-3 text-sm">
          Exploring the sample build?{" "}
          <Link href="/login?demo=1" className="font-medium underline">
            Use one-click demo accounts
          </Link>
          .
        </p>
      )}
    </div>
  );
}
