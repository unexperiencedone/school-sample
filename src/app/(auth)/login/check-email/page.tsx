import Link from "next/link";
import { MailCheck } from "lucide-react";
import { isDemoMode } from "@/config/school";

export const metadata = { title: "Check your email", robots: { index: false } };

export default function CheckEmail() {
  return (
    <div className="text-center">
      <MailCheck className="mx-auto mb-4 size-10 text-kiln-700" />
      <h1 className="t-h2 text-primary">Check your email</h1>
      <p className="mt-3 text-muted">
        If an account exists for that address, a sign-in link is on its way. It works once and expires in 30
        minutes.
      </p>
      {isDemoMode() && (
        <p className="mt-6 rounded-md bg-marigold-100 px-4 py-3 text-sm text-marigold-800">
          Sample build: emails are not sent. Open the outbox at{" "}
          <Link className="underline" href="/api/dev/outbox">
            /api/dev/outbox
          </Link>{" "}
          to click the link.
        </p>
      )}
      <Link href="/login" className="mt-8 inline-block text-sm text-primary underline">
        Back to sign in
      </Link>
    </div>
  );
}
