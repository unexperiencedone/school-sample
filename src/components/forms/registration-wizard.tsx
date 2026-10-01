"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Check, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import {
  boardingAllowed,
  boardingStep,
  childStep,
  DOCUMENT_KINDS,
  parentsStep,
  type BoardingStep,
  type ChildStep,
  type ParentsStep,
} from "@/lib/schemas/registration";
import { getUtm, track } from "@/lib/analytics";
import { startCheckout } from "@/lib/checkout-client";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import { DobSelect } from "./dob-select";
import { DocumentUpload } from "./document-upload";

type Option = { id: string; name: string; order?: number };
type Draft = {
  id: string;
  ref: string;
  token: string;
  step: number;
  child?: ChildStep;
  parents?: ParentsStep;
  boarding?: BoardingStep;
  docs?: Record<string, string>;
};

const STEPS = ["Child", "Parents", "Boarding", "Documents", "Review", "Payment"] as const;
const KEY = "ah_registration_draft";
const BOARDING = [
  {
    value: "FULL",
    title: "Full boarding",
    text: "Seven days a week in one of our four houses. From Year 5.",
  },
  { value: "FLEXI", title: "Flexi boarding", text: "Two to four nights a week, home the rest. From Year 3." },
  {
    value: "DAY",
    title: "Day boarding",
    text: "Full school day with supper and supervised prep. All years.",
  },
] as const;

function loadDraft(): Draft | null {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Draft | null;
  } catch {
    return null;
  }
}
function saveDraft(d: Draft) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* storage blocked: the wizard still works for this page view */
  }
}

async function api<T>(url: string, method: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { "x-draft-token": token } : {}) },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T & {
    error?: { message: string; details?: { fieldErrors?: Record<string, string[]> } };
  };
  if (!res.ok)
    throw Object.assign(new Error(json.error?.message ?? "Something went wrong"), {
      fieldErrors: json.error?.details?.fieldErrors,
    });
  return json;
}

/** Six-step online registration. Saves a server-side draft after step 1 so the family can't lose their work. */
export function RegistrationWizard({
  classes,
  years,
  feePaise,
}: {
  classes: (Option & { order: number })[];
  years: Option[];
  feePaise: number;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = loadDraft();
    if (d) {
      setDraft(d);
      setStep(Math.min(d.step, 4));
    }
  }, []);

  const persist = (patch: Partial<Draft>, next: number) => {
    const d = { ...(draft as Draft), ...patch, step: next };
    setDraft(d);
    saveDraft(d);
    setStep(next);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    requestAnimationFrame(() => document.getElementById("wizard-heading")?.focus());
  };

  const classOrder = (id?: string) => classes.find((c) => c.id === id)?.order ?? 0;

  return (
    <div>
      <ol className="mb-10 grid grid-cols-6 gap-1.5" aria-label="Registration progress">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined}>
            <div
              className={cn(
                "h-1.5 rounded-full",
                i < step ? "bg-marigold-500" : i === step ? "bg-damson-800" : "bg-sand",
              )}
            />
            <span
              className={cn(
                "mt-2 hidden text-xs sm:block",
                i === step ? "font-semibold text-fg" : "text-muted",
              )}
            >
              {i + 1}. {s}
            </span>
          </li>
        ))}
      </ol>
      <h2 id="wizard-heading" tabIndex={-1} className="t-h3 mb-1 text-primary focus:outline-none">
        Step {step + 1} of 6 · {STEPS[step]}
      </h2>
      {draft && <p className="mb-6 text-sm text-muted">Reference {draft.ref} · your progress is saved</p>}
      {error && (
        <p role="alert" className="mb-6 rounded-md bg-danger-bg px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {step === 0 && (
        <ChildForm
          classes={classes}
          years={years}
          initial={draft?.child}
          busy={busy}
          onSubmit={async (child) => {
            setBusy(true);
            try {
              if (draft) {
                await api("/api/registration", "PATCH", { id: draft.id, child }, draft.token);
                persist({ child }, 1);
              } else {
                const r = await api<{ id: string; ref: string; draftToken: string }>(
                  "/api/registration",
                  "POST",
                  { child, utm: getUtm() },
                );
                track("registration_start", { class: classes.find((c) => c.id === child.classId)?.name });
                const d: Draft = { id: r.id, ref: r.ref, token: r.draftToken, step: 1, child };
                setDraft(d);
                saveDraft(d);
                setStep(1);
              }
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

      {step === 1 && draft && (
        <ParentsForm
          initial={draft.parents}
          busy={busy}
          onBack={() => setStep(0)}
          onSubmit={async (parents) => {
            setBusy(true);
            try {
              await api("/api/registration", "PATCH", { id: draft.id, parents }, draft.token);
              persist({ parents }, 2);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

      {step === 2 && draft && (
        <BoardingForm
          initial={draft.boarding}
          classOrder={classOrder(draft.child?.classId)}
          className={classes.find((c) => c.id === draft.child?.classId)?.name ?? ""}
          busy={busy}
          onBack={() => setStep(1)}
          onSubmit={async (boarding) => {
            setBusy(true);
            try {
              await api("/api/registration", "PATCH", { id: draft.id, boarding }, draft.token);
              persist({ boarding }, 3);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

      {step === 3 && draft && (
        <div>
          <p className="mb-6 text-muted">
            Upload what you have now — you can add the rest later from your applicant dashboard. Files go
            straight to secure storage and are only visible to the admissions team.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {DOCUMENT_KINDS.map((d) => (
              <DocumentUpload
                key={d.kind}
                applicationId={draft.id}
                kind={d.kind}
                label={d.label}
                hint={d.hint}
                draftToken={draft.token}
                initial={{ fileName: draft.docs?.[d.kind] }}
                onUploaded={(name) => {
                  const nd = { ...draft, docs: { ...draft.docs, [d.kind]: name } };
                  setDraft(nd);
                  saveDraft(nd);
                }}
              />
            ))}
          </div>
          <div className="mt-8 flex gap-3">
            <Button variant="outline" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button onClick={() => persist({}, 4)}>
              {Object.keys(draft.docs ?? {}).length ? "Continue" : "Skip for now"}
            </Button>
          </div>
        </div>
      )}

      {step >= 4 && draft && (
        <ReviewAndPay
          draft={draft}
          classes={classes}
          years={years}
          feePaise={feePaise}
          busy={busy}
          onBack={() => setStep(3)}
          onEdit={(s) => setStep(s)}
          onPay={async () => {
            setBusy(true);
            setError(null);
            try {
              const r = await api<{ checkout: Parameters<typeof startCheckout>[0] }>(
                `/api/registration/${draft.id}/pay`,
                "POST",
                { declaration: true, dataConsent: true },
                draft.token,
              );
              track("payment_start", { purpose: "registration" });
              persist({}, 5);
              await startCheckout(r.checkout);
            } catch (e) {
              setError((e as Error).message);
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}

function errs(e: Record<string, unknown>, path: string): string | undefined {
  const v = path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], e);
  return (v as { message?: string } | undefined)?.message;
}

function ChildForm({
  classes,
  years,
  initial,
  busy,
  onSubmit,
}: {
  classes: Option[];
  years: Option[];
  initial?: ChildStep;
  busy: boolean;
  onSubmit: (v: ChildStep) => void;
}) {
  const { register, handleSubmit, formState } = useForm<z.input<typeof childStep>, unknown, ChildStep>({
    resolver: zodResolver(childStep),
    defaultValues: initial ?? { gender: "FEMALE", startYearId: years[years.length > 1 ? 1 : 0]?.id },
  });
  const e = formState.errors as Record<string, unknown>;
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-5 sm:grid-cols-2">
      <Field id="childFirstName" label="First name" required error={errs(e, "childFirstName")}>
        <Input
          id="childFirstName"
          autoComplete="off"
          aria-invalid={!!errs(e, "childFirstName")}
          {...register("childFirstName")}
        />
      </Field>
      <Field id="childLastName" label="Last name" required error={errs(e, "childLastName")}>
        <Input
          id="childLastName"
          autoComplete="off"
          aria-invalid={!!errs(e, "childLastName")}
          {...register("childLastName")}
        />
      </Field>
      <div className="sm:col-span-2">
        <DobSelect register={register} idPrefix="reg" error={errs(e, "dobDay") ?? errs(e, "dobYear")} />
      </div>
      <Field id="gender" label="Gender">
        <Select id="gender" {...register("gender")}>
          <option value="FEMALE">Girl</option>
          <option value="OTHER">Prefer to describe in a conversation</option>
        </Select>
      </Field>
      <Field id="currentSchool" label="Current school" hint="Leave blank if not yet at school">
        <Input id="currentSchool" {...register("currentSchool")} />
      </Field>
      <Field id="classId" label="Class applying for" required error={errs(e, "classId")}>
        <Select id="classId" defaultValue="" aria-invalid={!!errs(e, "classId")} {...register("classId")}>
          <option value="" disabled>
            Choose…
          </option>
          {classes.slice(0, -1).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="startYearId" label="Preferred start session" required error={errs(e, "startYearId")}>
        <Select id="startYearId" {...register("startYearId")}>
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? "Saving…" : "Save and continue"}
        </Button>
      </div>
    </form>
  );
}

const EMPTY_GUARDIANS: ParentsStep["guardians"] = [
  { relation: "Mother", name: "", occupation: "", phone: "", email: "", address: "" },
  { relation: "Father", name: "", occupation: "", phone: "", email: "", address: "" },
  { relation: "Guardian", name: "", occupation: "", phone: "", email: "", address: "" },
];

function ParentsForm({
  initial,
  busy,
  onBack,
  onSubmit,
}: {
  initial?: ParentsStep;
  busy: boolean;
  onBack: () => void;
  onSubmit: (v: ParentsStep) => void;
}) {
  const { register, handleSubmit, formState } = useForm<ParentsStep>({
    resolver: zodResolver(parentsStep),
    defaultValues: initial ?? { guardians: EMPTY_GUARDIANS, contactEmail: "", contactPhone: "" },
  });
  const e = formState.errors as Record<string, unknown>;
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-8">
      <p className="text-muted">Fill in at least one parent or guardian. Leave the others blank.</p>
      {EMPTY_GUARDIANS.map((g, i) => (
        <fieldset key={g.relation} className="rounded-lg border border-line p-5">
          <legend className="px-2 font-serif text-xl text-primary">{g.relation}</legend>
          <input type="hidden" {...register(`guardians.${i}.relation`)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={`g${i}-name`} label="Full name" error={errs(e, `guardians.${i}.name`)}>
              <Input
                id={`g${i}-name`}
                aria-invalid={!!errs(e, `guardians.${i}.name`)}
                {...register(`guardians.${i}.name`)}
              />
            </Field>
            <Field id={`g${i}-occupation`} label="Occupation">
              <Input id={`g${i}-occupation`} {...register(`guardians.${i}.occupation`)} />
            </Field>
            <Field id={`g${i}-phone`} label="Mobile" error={errs(e, `guardians.${i}.phone`)}>
              <Input
                id={`g${i}-phone`}
                type="tel"
                aria-invalid={!!errs(e, `guardians.${i}.phone`)}
                {...register(`guardians.${i}.phone`)}
              />
            </Field>
            <Field id={`g${i}-email`} label="Email" error={errs(e, `guardians.${i}.email`)}>
              <Input
                id={`g${i}-email`}
                type="email"
                aria-invalid={!!errs(e, `guardians.${i}.email`)}
                {...register(`guardians.${i}.email`)}
              />
            </Field>
            <Field
              id={`g${i}-address`}
              label="Residential address"
              className="sm:col-span-2"
              error={errs(e, `guardians.${i}.address`)}
            >
              <Textarea
                id={`g${i}-address`}
                rows={2}
                aria-invalid={!!errs(e, `guardians.${i}.address`)}
                {...register(`guardians.${i}.address`)}
              />
            </Field>
          </div>
        </fieldset>
      ))}
      <fieldset className="rounded-lg bg-cream p-5">
        <legend className="sr-only">Main contact</legend>
        <p className="mb-4 font-medium">Main contact for this application</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="contactEmail"
            label="Email"
            required
            hint="We'll send your sign-in link here"
            error={errs(e, "contactEmail")}
          >
            <Input
              id="contactEmail"
              type="email"
              autoComplete="email"
              aria-invalid={!!errs(e, "contactEmail")}
              {...register("contactEmail")}
            />
          </Field>
          <Field id="contactPhone" label="Mobile" required error={errs(e, "contactPhone")}>
            <Input
              id="contactPhone"
              type="tel"
              autoComplete="tel"
              aria-invalid={!!errs(e, "contactPhone")}
              {...register("contactPhone")}
            />
          </Field>
        </div>
      </fieldset>
      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? "Saving…" : "Save and continue"}
        </Button>
      </div>
    </form>
  );
}

function BoardingForm({
  initial,
  classOrder,
  className,
  busy,
  onBack,
  onSubmit,
}: {
  initial?: BoardingStep;
  classOrder: number;
  className: string;
  busy: boolean;
  onBack: () => void;
  onSubmit: (v: BoardingStep) => void;
}) {
  const { register, handleSubmit, watch, formState } = useForm<
    z.input<typeof boardingStep>,
    unknown,
    BoardingStep
  >({
    resolver: zodResolver(boardingStep),
    defaultValues: initial ?? { boardingType: undefined, scholarshipInterest: false },
  });
  const value = watch("boardingType");
  const err = (formState.errors.boardingType as { message?: string } | undefined)?.message;
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <fieldset aria-describedby={err ? "boarding-error" : undefined}>
        <legend className="mb-4 text-muted">Options available for {className}:</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          {BOARDING.map((b) => {
            const allowed = boardingAllowed(classOrder, b.value);
            return (
              <label
                key={b.value}
                className={cn(
                  "relative block cursor-pointer rounded-lg border-2 p-5 transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus",
                  value === b.value
                    ? "border-damson-800 bg-damson-50"
                    : "border-line hover:border-line-strong",
                  !allowed && "cursor-not-allowed opacity-50",
                )}
              >
                <input
                  type="radio"
                  value={b.value}
                  disabled={!allowed}
                  className="sr-only"
                  {...register("boardingType")}
                />
                {value === b.value && (
                  <Check className="absolute top-4 right-4 size-5 text-damson-800" aria-hidden />
                )}
                <span className="block font-serif text-xl text-primary">{b.title}</span>
                <span className="mt-1 block text-sm text-muted">
                  {allowed ? b.text : `Not offered for ${className}.`}
                </span>
              </label>
            );
          })}
        </div>
        {err && (
          <p id="boarding-error" role="alert" className="mt-2 text-sm text-danger">
            {err}
          </p>
        )}
      </fieldset>
      <label className="flex items-start gap-3 rounded-lg bg-cream p-4 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-[var(--primary)]"
          {...register("scholarshipInterest")}
        />
        <span>I&apos;d like my daughter to be considered for a scholarship or means-tested bursary.</span>
      </label>
      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? "Saving…" : "Save and continue"}
        </Button>
      </div>
    </form>
  );
}

function ReviewAndPay({
  draft,
  classes,
  years,
  feePaise,
  busy,
  onBack,
  onEdit,
  onPay,
}: {
  draft: Draft;
  classes: Option[];
  years: Option[];
  feePaise: number;
  busy: boolean;
  onBack: () => void;
  onEdit: (step: number) => void;
  onPay: () => void;
}) {
  const [declaration, setDeclaration] = useState(false);
  const [consent, setConsent] = useState(false);
  const [touched, setTouched] = useState(false);
  const c = draft.child;
  const rows: [string, string, number][] = [
    ["Child", c ? `${c.childFirstName} ${c.childLastName}` : "—", 0],
    ["Date of birth", c ? `${c.dobDay}/${c.dobMonth}/${c.dobYear}` : "—", 0],
    ["Class", classes.find((x) => x.id === c?.classId)?.name ?? "—", 0],
    ["Start session", years.find((x) => x.id === c?.startYearId)?.name ?? "—", 0],
    [
      "Parents / guardians",
      draft.parents?.guardians
        .filter((g) => g.name)
        .map((g) => `${g.name} (${g.relation})`)
        .join(", ") ?? "—",
      1,
    ],
    [
      "Main contact",
      draft.parents ? `${draft.parents.contactEmail} · ${draft.parents.contactPhone}` : "—",
      1,
    ],
    [
      "Boarding",
      draft.boarding ? (BOARDING.find((b) => b.value === draft.boarding?.boardingType)?.title ?? "") : "—",
      2,
    ],
    ["Documents", `${Object.keys(draft.docs ?? {}).length} of 4 uploaded`, 3],
  ];
  return (
    <div className="space-y-8">
      <dl className="divide-y divide-line rounded-lg border border-line bg-elevated">
        {rows.map(([k, v, s]) => (
          <div key={k} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3">
            <dt className="text-sm text-muted">{k}</dt>
            <dd className="flex items-baseline gap-3 text-sm font-medium">
              {v}
              <button type="button" className="text-xs text-kiln-700 underline" onClick={() => onEdit(s)}>
                Edit
              </button>
            </dd>
          </div>
        ))}
      </dl>
      <fieldset className="space-y-3 text-sm">
        <legend className="sr-only">Declaration and consent</legend>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={declaration}
            onChange={(e) => setDeclaration(e.target.checked)}
            className="mt-0.5 size-4 accent-[var(--primary)]"
            aria-invalid={touched && !declaration}
          />
          <span>
            I confirm the information is accurate and that I am the child&apos;s parent or lawful guardian.
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 size-4 accent-[var(--primary)]"
            aria-invalid={touched && !consent}
          />
          <span>
            I give parental consent for the school to process my daughter&apos;s personal data for admission,
            as described in the privacy policy.
          </span>
        </label>
        {touched && (!declaration || !consent) && (
          <p role="alert" className="text-danger">
            Please tick both boxes to continue.
          </p>
        )}
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-damson-900 p-6 text-paper">
        <div>
          <p className="text-sm text-damson-300">Registration fee (non-refundable)</p>
          <p className="font-serif text-3xl">{formatINR(feePaise)}</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="inverse"
            className="bg-transparent text-paper hover:bg-damson-800"
            onClick={onBack}
          >
            Back
          </Button>
          <Button
            variant="accent"
            size="lg"
            disabled={busy}
            onClick={() => {
              setTouched(true);
              if (declaration && consent) onPay();
            }}
          >
            <Lock className="size-4" aria-hidden /> {busy ? "Opening secure payment…" : "Proceed to payment"}
          </Button>
        </div>
      </div>
    </div>
  );
}
