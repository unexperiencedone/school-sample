"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { BOARDING_OPTIONS, CLASS_OPTIONS } from "@/lib/schemas/common";
import { leadSchema, TOUR_SLOTS, type LeadInput } from "@/lib/schemas/lead";
import { getUtm, track } from "@/lib/analytics";
import { school } from "@/config/school";
import { cn } from "@/lib/utils";
import { CaptchaField, type CaptchaHandle } from "./captcha-field";
import { DobSelect } from "./dob-select";

type Source = LeadInput["source"];

/**
 * The one enquiry form, reused in the drawer, admissions page, contact page (two tabs), event modal and
 * book-a-tour page. `source` records the placement; `type="TOUR"` adds date, time and visitors.
 */
export function EnquiryForm({
  source,
  type = "ENQUIRY",
  eventSlug,
  compact,
  submitLabel,
  onDone,
}: {
  source: Source;
  type?: "ENQUIRY" | "TOUR";
  eventSlug?: string;
  compact?: boolean;
  submitLabel?: string;
  onDone?: () => void;
}) {
  const id = `${source}-${type.toLowerCase()}`;
  const captchaRef = useRef<CaptchaHandle>(null);
  const [result, setResult] = useState<{ ref: string; tour?: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const minDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LeadInput>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      type,
      source,
      eventSlug,
      preferredBoarding: "unsure",
      ...(type === "TOUR" ? { visitors: 2 } : {}),
    } as LeadInput,
  });

  const onCaptcha = useCallback(
    (v: { token?: string; answer?: string }) => {
      setValue("captchaToken", v.token);
      setValue("captchaAnswer", v.answer);
    },
    [setValue],
  );

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, utm: getUtm() }),
      });
      const body = (await res.json()) as {
        ref?: string;
        tour?: string;
        error?: { message: string; details?: { fieldErrors?: Record<string, string[]> } };
      };
      if (!res.ok) {
        const fieldErrors = body.error?.details?.fieldErrors ?? {};
        for (const [name, msgs] of Object.entries(fieldErrors))
          setError(name as keyof LeadInput, { message: msgs[0] });
        if (fieldErrors.captchaAnswer || res.status === 422) captchaRef.current?.refresh();
        setFormError(body.error?.message ?? "Something went wrong. Please try again.");
        return;
      }
      track(type === "TOUR" ? "tour_book" : "lead_submit", { source, class: values.classApplying });
      setResult({ ref: body.ref!, tour: body.tour });
    } catch {
      setFormError(
        `We couldn't reach the server. Please try again, or call ${school.contact.admissionsPhone}.`,
      );
    }
  });

  if (result) {
    return (
      <div role="status" className="page-enter rounded-lg bg-success-bg/60 p-6 text-center">
        <CheckCircle2 className="mx-auto size-10 text-success" aria-hidden />
        <p className="mt-3 font-serif text-2xl text-primary">
          {type === "TOUR" ? "Your visit is booked" : "Thank you — we'll be in touch"}
        </p>
        <p className="mt-2 text-sm text-muted">
          {type === "TOUR"
            ? `We've reserved ${result.tour}. A confirmation is on its way to your email.`
            : "Our admissions team will call you within one working day. A confirmation is on its way to your email."}
        </p>
        <p className="mt-3 text-xs text-muted">
          Reference <span className="font-mono font-semibold text-fg">{result.ref}</span>
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {type !== "TOUR" && (
            <Button asChild size="sm" variant="outline">
              <Link href="/book-a-tour" onClick={onDone}>
                Book a campus visit
              </Link>
            </Button>
          )}
          <Button asChild size="sm" variant="ghost">
            <Link href="/virtual-tour" onClick={onDone}>
              Take the virtual tour
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const e = errors as Record<string, { message?: string } | undefined>;
  const err = (name: string) => e[name]?.message;
  const aria = (name: string) => ({
    "aria-invalid": !!err(name),
    "aria-describedby": err(name) ? `${id}-${name}-error` : undefined,
  });

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="space-y-4"
      aria-describedby={formError ? `${id}-formerror` : undefined}
    >
      <input type="hidden" {...register("type")} />
      <input type="hidden" {...register("source")} />
      {/* Honeypot (hidden from people and assistive tech) */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 overflow-hidden">
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} tabIndex={-1} autoComplete="off" {...register("website")} />
      </div>

      <div className={cn("grid gap-4", !compact && "sm:grid-cols-2")}>
        <Field id={`${id}-parentName`} label="Parent / guardian name" required error={err("parentName")}>
          <Input
            id={`${id}-parentName`}
            autoComplete="name"
            {...aria("parentName")}
            {...register("parentName")}
          />
        </Field>
        <Field id={`${id}-phone`} label="Mobile number" required error={err("phone")}>
          <Input
            id={`${id}-phone`}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+91 98765 43210"
            {...aria("phone")}
            {...register("phone")}
          />
        </Field>
        <Field
          id={`${id}-email`}
          label="Email"
          required
          error={err("email")}
          className={cn(!compact && "sm:col-span-2")}
        >
          <Input
            id={`${id}-email`}
            type="email"
            autoComplete="email"
            {...aria("email")}
            {...register("email")}
          />
        </Field>
        <Field id={`${id}-childName`} label="Child's name" error={err("childName")}>
          <Input id={`${id}-childName`} autoComplete="off" {...register("childName")} />
        </Field>
        <Field id={`${id}-classApplying`} label="Class applying for" required error={err("classApplying")}>
          <Select
            id={`${id}-classApplying`}
            {...aria("classApplying")}
            {...register("classApplying")}
            defaultValue=""
          >
            <option value="" disabled>
              Choose…
            </option>
            {CLASS_OPTIONS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <div className={cn(!compact && "sm:col-span-2")}>
          <DobSelect register={register} idPrefix={id} error={err("dobDay") ?? err("dobYear")} />
        </div>
        <Field
          id={`${id}-preferredBoarding`}
          label="Boarding preference"
          className={cn(!compact && "sm:col-span-2")}
        >
          <Select id={`${id}-preferredBoarding`} {...register("preferredBoarding")}>
            {BOARDING_OPTIONS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </Select>
        </Field>

        {type === "TOUR" && (
          <>
            <Field id={`${id}-preferredDate`} label="Preferred date" required error={err("preferredDate")}>
              <Input
                id={`${id}-preferredDate`}
                type="date"
                min={minDate}
                {...aria("preferredDate")}
                {...register("preferredDate")}
              />
            </Field>
            <Field id={`${id}-preferredSlot`} label="Preferred time" required error={err("preferredSlot")}>
              <Select
                id={`${id}-preferredSlot`}
                defaultValue=""
                {...aria("preferredSlot")}
                {...register("preferredSlot")}
              >
                <option value="" disabled>
                  Choose…
                </option>
                {TOUR_SLOTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id={`${id}-visitors`} label="Number of visitors" required error={err("visitors")}>
              <Select id={`${id}-visitors`} {...register("visitors")}>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}

        <Field
          id={`${id}-message`}
          label={type === "TOUR" ? "Anything we should know?" : "Your question (optional)"}
          className={cn(!compact && "sm:col-span-2")}
          error={err("message")}
        >
          <Textarea id={`${id}-message`} rows={compact ? 3 : 4} {...register("message")} />
        </Field>
      </div>

      <CaptchaField ref={captchaRef} id={`${id}-captcha`} onChange={onCaptcha} error={err("captchaAnswer")} />

      <div>
        <label className="flex items-start gap-3 text-sm text-muted">
          <input
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
            {...aria("consent")}
            {...register("consent")}
          />
          <span>
            I am the child&apos;s parent or guardian and agree that {school.shortName} may contact me by
            phone, email and WhatsApp about this enquiry. See our{" "}
            <Link href="/privacy" className="underline" target="_blank">
              privacy policy
            </Link>
            .
          </span>
        </label>
        {err("consent") && (
          <p id={`${id}-consent-error`} role="alert" className="mt-1.5 text-xs font-medium text-danger">
            {err("consent")}
          </p>
        )}
      </div>

      {formError && (
        <p
          id={`${id}-formerror`}
          role="alert"
          className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger"
        >
          {formError}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={isSubmitting}>
        {isSubmitting ? "Sending…" : (submitLabel ?? (type === "TOUR" ? "Book my visit" : "Send enquiry"))}
      </Button>
    </form>
  );
}
