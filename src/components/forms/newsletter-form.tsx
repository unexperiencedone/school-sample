"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";

export function NewsletterForm() {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  return state === "done" ? (
    <p role="status" className="text-sm text-marigold-300">
      Thank you — you&apos;re on the list for our termly newsletter.
    </p>
  ) : (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (state === "sending") return;
        const form = new FormData(e.currentTarget);
        setState("sending");
        const res = await fetch("/api/newsletter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: form.get("email"),
            consent: form.get("consent") === "on",
            website: form.get("website") ?? "",
          }),
        });
        if (res.ok) {
          track("newsletter_signup");
          setState("done");
        } else setState("error");
      }}
    >
      <label htmlFor="nl-email" className="text-sm text-damson-300">
        The termly newsletter
      </label>
      <div className="flex gap-2">
        <input
          id="nl-email"
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          className="h-11 min-w-0 flex-1 rounded-md border border-damson-700 bg-damson-900 px-3 text-sm text-paper placeholder:text-damson-300/70"
        />
        <button
          type="submit"
          className="h-11 rounded-md bg-marigold-500 px-4 text-sm font-semibold text-damson-950 hover:bg-marigold-300"
          disabled={state === "sending"}
        >
          Subscribe
        </button>
      </div>
      <input
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="absolute -left-[9999px]"
      />
      <label className="flex items-start gap-2 text-xs text-damson-300">
        <input type="checkbox" name="consent" required className="mt-0.5 accent-[var(--accent)]" /> I agree to
        receive the newsletter. Unsubscribe any time.
      </label>
      {state === "error" && (
        <p role="alert" className="text-xs text-kiln-400">
          That didn&apos;t work — please check your email and try again.
        </p>
      )}
    </form>
  );
}
