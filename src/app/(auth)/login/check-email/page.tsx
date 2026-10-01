import Link from "next/link";
import { MailCheck } from "lucide-react";
import { isDemoMode } from "@/config/school";

export const metadata = { title: "Check your email", robots: { index: false } };

export default function CheckEmail() {
  return (
    <div className="text-center">
      <MailCheck className="text-kiln-700 mx-auto mb-4 size-10" />
      <h1 className="t-h2 text-primary">Check your email</h1>
      <p className="text-muted mt-3">
        If an account exists for that address, a sign-in link is on its way. It works once and expires in 30
        minutes.
      </p>
      {isDemoMode() && (
        <p className="bg-marigold-100 text-marigold-700 mt-6 rounded-md px-4 py-3 text-sm">
          Sample build: emails are not sent. Open the outbox at{" "}
          <Link className="underline" href="/api/dev/outbox">
            /api/dev/outbox
          </Link>{" "}
          to click the link.
        </p>
      )}
      <Link href="/login" className="text-primary mt-8 inline-block text-sm underline">
        Back to sign in
      </Link>
    </div>
  );
}
