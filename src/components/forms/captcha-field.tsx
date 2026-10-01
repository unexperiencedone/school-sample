"use client";

import { RefreshCw } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Challenge = {
  widget: "image" | "turnstile" | "recaptcha" | "none";
  token?: string;
  image?: string;
  siteKey?: string | null;
};
export type CaptchaHandle = { refresh: () => void };

/**
 * Renders the configured captcha. For the default image captcha, the signed token and the typed answer are
 * reported via `onChange`. Turnstile/reCAPTCHA widgets would mount here when configured (keys required).
 */
export const CaptchaField = forwardRef<
  CaptchaHandle,
  { id: string; error?: string; onChange: (v: { token?: string; answer?: string }) => void }
>(function CaptchaField({ id, error, onChange }, ref) {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [answer, setAnswer] = useState("");

  const load = useCallback(async () => {
    setAnswer("");
    try {
      const res = await fetch("/api/captcha", { cache: "no-store" });
      const c = (await res.json()) as Challenge;
      setChallenge(c);
      onChange({ token: c.token, answer: "" });
    } catch {
      setChallenge(null);
    }
  }, [onChange]);

  useImperativeHandle(ref, () => ({ refresh: load }), [load]);
  useEffect(() => {
    void load();
  }, [load]);

  if (challenge?.widget === "none") return null;
  if (challenge && challenge.widget !== "image") {
    return (
      <p className="text-xs text-muted">
        Security check provided by {challenge.widget}. (Configure the site key to render the widget.)
      </p>
    );
  }

  return (
    <div>
      <Label htmlFor={id} required>
        Type the characters you see
      </Label>
      <div className="flex items-center gap-3">
        <div className="h-[56px] w-[180px] shrink-0 overflow-hidden rounded-md border border-line bg-cream">
          {challenge?.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={challenge.image}
              alt="Security check: five distorted characters. Use the refresh button for a new code."
              width={180}
              height={56}
            />
          )}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md p-2 text-muted hover:bg-sunken hover:text-fg"
          aria-label="Get a new code"
        >
          <RefreshCw className="size-4" />
        </button>
        <Input
          id={id}
          value={answer}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={8}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => {
            setAnswer(e.target.value);
            onChange({ token: challenge?.token, answer: e.target.value });
          }}
          className="max-w-36 font-mono tracking-[0.3em] uppercase"
        />
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
});
