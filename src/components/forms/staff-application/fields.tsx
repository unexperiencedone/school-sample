"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import type { FieldValues, Path, UseFormHandleSubmit, UseFormSetError } from "react-hook-form";
import { Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { currentMonthIst, friendlyMessage, type Issue } from "./rules";

/** Walks an RHF error tree to the message at `path` ("items.0.name"). */
export function errorAt(errors: unknown, path: string): string | undefined {
  const node = path
    .split(".")
    .reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], errors);
  const message = (node as { message?: string } | undefined)?.message;
  return message ? friendlyMessage(message) : undefined;
}

/** A message about a whole repeater (for example "Provide two referees"): RHF files it under `root` or on the array itself. */
export function listError(errors: unknown, name: string): string | undefined {
  return errorAt(errors, `${name}.root`) ?? errorAt(errors, name);
}

/**
 * The first control for a field path ("items.2.role"), or for a whole repeater ("items.root"), inside the step form.
 * Fields are found by `name`, which every control carries whether it is registered or Controller-backed. Hidden
 * inputs can't take focus.
 */
export function findField(path: string): HTMLElement | null {
  const form = document.querySelector("form[data-step-form]");
  const top = path.split(".")[0] ?? path;
  const live = ':not([type="hidden"])';
  return (
    form?.querySelector<HTMLElement>(`[name="${path}"]${live}`) ??
    form?.querySelector<HTMLElement>(`[name^="${top}."]${live}`) ??
    form?.querySelector<HTMLElement>(`[name="${top}"]${live}`) ??
    null
  );
}

/** Applies issues returned by the server (after a save or submit) to the form, and focuses the first flagged field. */
export function useServerIssues<T extends FieldValues>(
  setError: UseFormSetError<T>,
  issues: Issue[] | undefined,
) {
  useEffect(() => {
    for (const i of issues ?? [])
      setError((i.path === "items" ? "items.root" : i.path) as Path<T>, {
        type: "server",
        message: i.message,
      });
    const first = issues?.[0];
    if (first) findField(first.path)?.focus();
  }, [issues, setError]);
}

/** Moves focus to the alert it is attached to and scrolls it into view, each time `announce` is called. */
export function useAlertFocus() {
  const ref = useRef<HTMLParagraphElement>(null);
  const [calls, setCalls] = useState(0);
  useEffect(() => {
    if (calls === 0) return;
    ref.current?.focus({ preventScroll: true });
    ref.current?.scrollIntoView({ block: "center" });
  }, [calls]);
  return { ref, announce: () => setCalls((n) => n + 1) };
}

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  fullName: "Full name",
  dob: "Date of birth",
  gender: "Gender",
  nationality: "Nationality",
  phone: "Mobile number",
  email: "Email",
  address: "Home address",
  noticeOrAvailability: "Earliest start date or notice period",
  maritalStatus: "Marital status",
  name: "Name",
  emergencyName: "Emergency contact name",
  emergencyRelation: "Emergency contact relationship",
  emergencyPhone: "Emergency contact mobile number",
  qualification: "Qualification",
  institution: "Institution",
  year: "Year awarded",
  grade: "Grade or class",
  certificateKey: "Certificate",
  employed: "Currently employed",
  employer: "Employer",
  role: "Job title",
  since: "Started",
  noticePeriod: "Notice period",
  reasonForLeaving: "Reason for leaving",
  from: "From",
  to: "To",
  subjects: "Subjects and areas",
  phases: "Phases",
  interests: "Interests",
  text: "Personal statement",
  organisation: "Organisation",
  relationship: "How they know you",
  isCurrentEmployer: "Current employer",
  safeguarding: "Safeguarding statement",
  convictions: "Convictions question",
  convictionsDetail: "Convictions details",
  pendingAction: "Pending action question",
  pendingActionDetail: "Pending action details",
  consent: "Consent",
  truthful: "Accuracy statement",
};

/** Keys on an RHF error node that are not child fields. */
const ERROR_META = new Set(["message", "type", "ref", "types"]);

export type SummaryItem = { path: string; text: string };

/**
 * Flattens RHF's error tree into one line per problem. `rows` names the repeater at a top-level key
 * (`{ items: "Referee" }`), so "items.1.email" reads "Referee 2, Email: ...".
 */
export function summarise(errors: unknown, rows: Record<string, string> = {}): SummaryItem[] {
  const out: SummaryItem[] = [];
  const walk = (node: unknown, path: string[]) => {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    if (typeof n.message === "string" && n.message && path.length > 0) {
      const noun = rows[path[0] ?? ""];
      const row = noun && /^\d+$/.test(path[1] ?? "") ? `${noun} ${Number(path[1]) + 1}` : undefined;
      const label = FIELD_LABELS[path[path.length - 1] ?? ""];
      const where = [row, label].filter(Boolean).join(", ");
      out.push({
        path: path.join("."),
        text: `${where ? `${where}: ` : ""}${friendlyMessage(n.message)}`,
      });
    }
    for (const [k, v] of Object.entries(n)) if (!ERROR_META.has(k)) walk(v, [...path, k]);
  };
  walk(errors, []);
  return out;
}

/** Short list of what needs fixing. It takes focus when a submit fails; each line moves focus to its field. */
export const ErrorSummary = forwardRef<HTMLDivElement, { items: SummaryItem[] }>(function ErrorSummary(
  { items },
  ref,
) {
  if (items.length === 0) return null;
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="rounded-md border border-danger/40 bg-danger-bg px-4 py-3 text-sm text-danger"
    >
      <p className="font-semibold">
        {items.length === 1 ? "There is 1 answer to fix" : `There are ${items.length} answers to fix`}
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {items.map((i) => (
          <li key={i.path}>
            <a
              href="#"
              className="underline"
              onClick={(e) => {
                e.preventDefault();
                findField(i.path)?.focus();
              }}
            >
              {i.text}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
});

/**
 * Wires a step's form for submit: props to spread on the `<form>`, and the error summary to render inside it. A failed
 * validation focuses the summary (react-hook-form's own focus is off, so Controller-backed fields behave like the rest).
 */
export function useStepSubmit<TIn extends FieldValues, TOut>(
  handleSubmit: UseFormHandleSubmit<TIn, TOut>,
  onValid: (values: TOut) => unknown,
  rows?: Record<string, string>,
) {
  const [items, setItems] = useState<SummaryItem[]>([]);
  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (items.length > 0) summaryRef.current?.focus();
  }, [items]);
  const onSubmit = handleSubmit(
    (values) => {
      setItems((s) => (s.length ? [] : s));
      return onValid(values);
    },
    (errors) => setItems(summarise(errors, rows)),
  );
  return {
    formProps: { onSubmit, noValidate: true, "data-step-form": "" },
    summary: <ErrorSummary ref={summaryRef} items={items} />,
  };
}

const describedBy = (id: string, error?: string, hint?: ReactNode) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

type Common = {
  id: string;
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  wrap?: string;
};

export const TextField = forwardRef<HTMLInputElement, Common & InputHTMLAttributes<HTMLInputElement>>(
  function TextField({ id, label, required, hint, error, wrap, ...props }, ref) {
    return (
      <Field id={id} label={label} required={required} hint={hint} error={error} className={wrap}>
        <Input
          ref={ref}
          id={id}
          aria-invalid={!!error}
          aria-describedby={describedBy(id, error, hint)}
          aria-required={required}
          {...props}
        />
      </Field>
    );
  },
);

export const SelectField = forwardRef<HTMLSelectElement, Common & SelectHTMLAttributes<HTMLSelectElement>>(
  function SelectField({ id, label, required, hint, error, wrap, children, ...props }, ref) {
    return (
      <Field id={id} label={label} required={required} hint={hint} error={error} className={wrap}>
        <Select
          ref={ref}
          id={id}
          aria-invalid={!!error}
          aria-describedby={describedBy(id, error, hint)}
          aria-required={required}
          {...props}
        >
          {children}
        </Select>
      </Field>
    );
  },
);

export const TextareaField = forwardRef<
  HTMLTextAreaElement,
  Common & TextareaHTMLAttributes<HTMLTextAreaElement>
>(function TextareaField({ id, label, required, hint, error, wrap, ...props }, ref) {
  return (
    <Field id={id} label={label} required={required} hint={hint} error={error} className={wrap}>
      <Textarea
        ref={ref}
        id={id}
        aria-invalid={!!error}
        aria-describedby={describedBy(id, error, hint)}
        aria-required={required}
        {...props}
      />
    </Field>
  );
});

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Month and year as two labelled selects (reads the same in every browser, unlike `<input type="month">`).
 * Emits `yyyy-mm` once both are chosen and "" until then.
 */
export function MonthYearField({
  id,
  name,
  label,
  value,
  onChange,
  error,
  required,
}: {
  id: string;
  /** The form field name; it goes on the month select so a failed validation can find and focus it. */
  name: string;
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
}) {
  const [year, setYear] = useState(value?.slice(0, 4) ?? "");
  const [month, setMonth] = useState(value?.slice(5, 7) ?? "");
  const thisYear = Number(currentMonthIst().slice(0, 4));
  const years = Array.from({ length: thisYear - 1959 }, (_, i) => String(thisYear - i));
  const update = (nextYear: string, nextMonth: string) => {
    setYear(nextYear);
    setMonth(nextMonth);
    onChange(nextYear && nextMonth ? `${nextYear}-${nextMonth}` : "");
  };
  return (
    <fieldset className="min-w-0" aria-describedby={error ? `${id}-error` : undefined}>
      <legend className="mb-1.5 text-sm font-medium text-fg">
        {label}
        {required && (
          <span className="ml-0.5 text-kiln-700" aria-hidden="true">
            *
          </span>
        )}
      </legend>
      <div className="grid grid-cols-[1.4fr_1fr] gap-2">
        <Select
          id={`${id}-month`}
          name={name}
          aria-label={`${label}: month`}
          aria-invalid={!!error}
          value={month}
          onChange={(e) => update(year, e.target.value)}
        >
          <option value="">Month</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={String(i + 1).padStart(2, "0")}>
              {m}
            </option>
          ))}
        </Select>
        <Select
          id={`${id}-year`}
          aria-label={`${label}: year`}
          aria-invalid={!!error}
          value={year}
          onChange={(e) => update(e.target.value, month)}
        >
          <option value="">Year</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Single checkbox with a label that wraps and a 44px-high hit area. */
export const CheckField = forwardRef<
  HTMLInputElement,
  { id: string; error?: string; children: ReactNode } & InputHTMLAttributes<HTMLInputElement>
>(function CheckField({ id, error, children, className, ...props }, ref) {
  return (
    <div className={className}>
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm">
        <input
          ref={ref}
          id={id}
          type="checkbox"
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]"
          {...props}
        />
        <span>{children}</span>
      </label>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
});

/**
 * A group of toggle chips built from real checkboxes. The selected state shows a tick as well as a colour change,
 * and focus lands on the visually hidden checkbox so the ring shows on the chip.
 */
export function ChipGroup({
  legend,
  hint,
  options,
  selected,
  max,
  error,
  idPrefix,
  register,
}: {
  legend: string;
  hint?: ReactNode;
  options: readonly string[];
  selected: readonly string[];
  max?: number;
  error?: string;
  idPrefix: string;
  register: (value: string) => InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> };
}) {
  const hintId = useId();
  const full = max !== undefined && selected.length >= max;
  return (
    <fieldset aria-describedby={`${hintId}${error ? ` ${idPrefix}-error` : ""}`}>
      <legend className="mb-1 text-sm font-medium text-fg">
        {legend}
        <span className="ml-0.5 text-kiln-700" aria-hidden="true">
          *
        </span>
      </legend>
      <p id={hintId} className="mb-3 text-xs text-muted">
        {hint}
        {max !== undefined && ` ${selected.length} of ${max} chosen.`}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected.includes(o);
          const disabled = full && !on;
          return (
            <label
              key={o}
              className={cn(
                "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                on
                  ? "border-damson-800 bg-damson-800 text-paper"
                  : "border-line-strong bg-elevated hover:bg-sunken",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <input type="checkbox" value={o} disabled={disabled} className="sr-only" {...register(o)} />
              {on && <Check className="size-4" aria-hidden />}
              {o}
            </label>
          );
        })}
      </div>
      {error && (
        <p id={`${idPrefix}-error`} role="alert" className="mt-2 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Repeater row frame: a fieldset named for the row, with a remove button whose name says which row. */
export function RepeaterRow({
  legend,
  removeLabel,
  onRemove,
  removeDisabled,
  children,
}: {
  legend: string;
  removeLabel: string;
  onRemove?: () => void;
  removeDisabled?: boolean;
  children: ReactNode;
}) {
  return (
    <fieldset className="min-w-0 rounded-lg border border-line bg-elevated p-4 sm:p-5">
      <legend className="px-2 font-serif text-lg text-primary">{legend}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
      {onRemove && (
        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={onRemove}
            disabled={removeDisabled}
          >
            <Trash2 aria-hidden /> {removeLabel}
          </Button>
        </div>
      )}
    </fieldset>
  );
}

export function AddRowButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button type="button" variant="outline" size="lg" onClick={onClick}>
      <Plus aria-hidden /> {children}
    </Button>
  );
}

/**
 * Back / Next row under every step. While `hold` has text both buttons are off and the text says why (for example a
 * file still uploading); pass "" when nothing is holding the step so the live region exists before it first speaks.
 */
export function StepFooter({
  onBack,
  busy,
  hold,
  nextLabel = "Save and continue",
}: {
  onBack?: () => void;
  busy: boolean;
  hold?: string;
  nextLabel?: string;
}) {
  const off = busy || !!hold;
  return (
    <div className="mt-8">
      {hold !== undefined && (
        <p role="status" className="text-sm text-muted [&:not(:empty)]:mb-3">
          {hold}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {onBack && (
          <Button type="button" variant="outline" size="lg" onClick={onBack} disabled={off}>
            Back
          </Button>
        )}
        <Button type="submit" size="lg" disabled={off}>
          {busy ? "Saving…" : nextLabel}
        </Button>
      </div>
    </div>
  );
}
