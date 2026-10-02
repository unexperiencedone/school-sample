"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch, type UseFormRegister } from "react-hook-form";
import type { z } from "zod";
import { FileX2, TriangleAlert } from "lucide-react";
import { CaptchaField, type CaptchaHandle } from "@/components/forms/captcha-field";
import {
  PHASES,
  STATEMENT_WORDS,
  SUBJECTS,
  gapsFor,
  wordCount,
  type Gap,
  type StaffApplicationData,
} from "@/lib/schemas/staff-application";
import { school } from "@/config/school";
import { cn } from "@/lib/utils";
import { CertificateUpload } from "./certificate-upload";
import {
  AddRowButton,
  CheckField,
  ChipGroup,
  errorAt,
  listError,
  MonthYearField,
  RepeaterRow,
  SelectField,
  StepFooter,
  TextareaField,
  TextField,
  useAlertFocus,
  useServerIssues,
  useStepSubmit,
} from "./fields";
import { currentMonthIst, describeGap, FORM_SCHEMAS, todayIst, type Issue } from "./rules";

/** What every step form receives. `onNext` gets the validated values; `onBack` gets whatever is typed so far. */
type StepProps = {
  busy: boolean;
  issues: Issue[] | undefined;
  onNext: (values: unknown) => void;
  onBack?: (raw: unknown) => void;
};

const ONE_ROW_FORM = "space-y-6";

/* ───────────────────────────── 1. Personal ───────────────────────────── */

type PersonalIn = z.input<typeof FORM_SCHEMAS.personal>;
type PersonalOut = z.output<typeof FORM_SCHEMAS.personal>;

/** `closesAt` is an ISO date, or "" for a draft whose vacancy has since closed. */
export type VacancyOption = {
  slug: string;
  title: string;
  department: string;
  employment: string;
  closesAt: string;
};

export function PersonalStep({
  initial,
  busy,
  issues,
  onNext,
  vacancies,
  vacancySlug,
  onVacancyChange,
}: StepProps & {
  initial: StaffApplicationData["personal"];
  vacancies: VacancyOption[];
  vacancySlug: string;
  onVacancyChange: (slug: string) => void;
}) {
  const form = useForm<PersonalIn, unknown, PersonalOut>({
    resolver: zodResolver(FORM_SCHEMAS.personal),
    shouldFocusError: false,
    defaultValues: initial,
  });
  const { register, handleSubmit, formState, setError } = form;
  useServerIssues(setError, issues);
  const { formProps, summary } = useStepSubmit(handleSubmit, onNext);
  const err = (p: string) => errorAt(formState.errors, p);
  return (
    <form {...formProps} className={ONE_ROW_FORM}>
      {summary}
      <div className="flex items-start gap-3 rounded-lg bg-info-bg px-4 py-3 text-sm text-info">
        <FileX2 className="mt-0.5 size-5 shrink-0" aria-hidden />
        <p>
          <strong className="font-semibold">We cannot accept a CV instead of this form.</strong> Please
          complete every section. It takes about 20 minutes and saves as you go.
        </p>
      </div>
      <SelectField
        id="vacancy"
        label="Role you are applying for"
        hint="Choose a vacancy, or send a general application and we will keep it on file."
        value={vacancySlug}
        onChange={(e) => onVacancyChange(e.target.value)}
      >
        <option value="">General application (no specific vacancy)</option>
        {vacancies.map((v) => (
          <option key={v.slug} value={v.slug}>
            {v.title} · {v.department}
          </option>
        ))}
      </SelectField>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="title"
          label="Title"
          required
          defaultValue=""
          error={err("title")}
          {...register("title")}
        >
          <option value="" disabled>
            Choose…
          </option>
          {["Ms", "Mrs", "Miss", "Mr", "Mx", "Dr"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </SelectField>
        <TextField
          id="fullName"
          label="Full name"
          required
          autoComplete="name"
          error={err("fullName")}
          {...register("fullName")}
        />
        <TextField
          id="dob"
          label="Date of birth"
          type="date"
          required
          autoComplete="bday"
          max={todayIst()}
          error={err("dob")}
          {...register("dob")}
        />
        <SelectField
          id="gender"
          label="Gender"
          required
          defaultValue=""
          error={err("gender")}
          {...register("gender")}
        >
          <option value="" disabled>
            Choose…
          </option>
          <option value="FEMALE">Female</option>
          <option value="MALE">Male</option>
          <option value="OTHER">Another description</option>
          <option value="UNDISCLOSED">Prefer not to say</option>
        </SelectField>
        <TextField
          id="nationality"
          label="Nationality"
          required
          error={err("nationality")}
          {...register("nationality")}
        />
        <TextField
          id="phone"
          label="Mobile number"
          type="tel"
          inputMode="tel"
          required
          autoComplete="tel"
          placeholder="+91 98765 43210"
          error={err("phone")}
          {...register("phone")}
        />
        <TextField
          id="email"
          label="Email"
          type="email"
          required
          autoComplete="email"
          hint="We email your resume link here."
          wrap="sm:col-span-2"
          error={err("email")}
          {...register("email")}
        />
        <TextareaField
          id="address"
          label="Home address"
          rows={3}
          required
          autoComplete="street-address"
          wrap="sm:col-span-2"
          error={err("address")}
          {...register("address")}
        />
        <TextField
          id="noticeOrAvailability"
          label="Earliest start date or notice period"
          wrap="sm:col-span-2"
          error={err("noticeOrAvailability")}
          {...register("noticeOrAvailability")}
        />
      </div>
      <StepFooter busy={busy} />
    </form>
  );
}

/* ───────────────────────────── 2. Family ───────────────────────────── */

type FamilyIn = z.input<typeof FORM_SCHEMAS.family>;
type FamilyOut = z.output<typeof FORM_SCHEMAS.family>;

export function FamilyStep({
  initial,
  busy,
  issues,
  onNext,
  onBack,
}: StepProps & { initial: StaffApplicationData["family"] }) {
  const form = useForm<FamilyIn, unknown, FamilyOut>({
    resolver: zodResolver(FORM_SCHEMAS.family),
    shouldFocusError: false,
    defaultValues: initial ?? { children: [] },
  });
  const { register, handleSubmit, formState, setError, control, getValues } = form;
  const children = useFieldArray({ control, name: "children" });
  useServerIssues(setError, issues);
  const { formProps, summary } = useStepSubmit(handleSubmit, onNext, { children: "Child" });
  const err = (p: string) => errorAt(formState.errors, p);
  return (
    <form {...formProps} className={ONE_ROW_FORM}>
      {summary}
      <SelectField
        id="maritalStatus"
        label="Marital status"
        hint="Optional."
        defaultValue=""
        error={err("maritalStatus")}
        {...register("maritalStatus")}
      >
        <option value="">Prefer not to say</option>
        {["Single", "Married", "Partnered", "Separated or divorced", "Widowed"].map((s) => (
          <option key={s}>{s}</option>
        ))}
      </SelectField>

      <section aria-labelledby="children-heading" className="space-y-4">
        <div>
          <h3 id="children-heading" className="font-serif text-xl text-primary">
            Children
          </h3>
          <p className="text-sm text-muted">
            Optional. It helps us plan for staff families (for example places at the school and housing).
          </p>
        </div>
        {children.fields.map((f, i) => (
          <RepeaterRow
            key={f.id}
            legend={`Child ${i + 1}`}
            removeLabel={`Remove child ${i + 1}`}
            onRemove={() => children.remove(i)}
          >
            <TextField
              id={`child-${i}-name`}
              label="Name"
              required
              error={err(`children.${i}.name`)}
              {...register(`children.${i}.name`)}
            />
            <TextField
              id={`child-${i}-dob`}
              label="Date of birth"
              type="date"
              required
              max={todayIst()}
              error={err(`children.${i}.dob`)}
              {...register(`children.${i}.dob`)}
            />
          </RepeaterRow>
        ))}
        {children.fields.length < 8 && (
          <AddRowButton onClick={() => children.append({ name: "", dob: "" })}>Add a child</AddRowButton>
        )}
      </section>

      <fieldset className="space-y-4 rounded-lg border border-line p-4 sm:p-5">
        <legend className="px-2 font-serif text-xl text-primary">Emergency contact</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="emergencyName"
            label="Name"
            required
            error={err("emergencyName")}
            {...register("emergencyName")}
          />
          <TextField
            id="emergencyRelation"
            label="Relationship to you"
            required
            error={err("emergencyRelation")}
            {...register("emergencyRelation")}
          />
          <TextField
            id="emergencyPhone"
            label="Mobile number"
            type="tel"
            inputMode="tel"
            required
            wrap="sm:col-span-2"
            error={err("emergencyPhone")}
            {...register("emergencyPhone")}
          />
        </div>
      </fieldset>
      <StepFooter busy={busy} onBack={() => onBack?.(getValues())} />
    </form>
  );
}

/* ───────────────────────────── 3. Education ───────────────────────────── */

type EducationIn = z.input<typeof FORM_SCHEMAS.education>;
type EducationOut = z.output<typeof FORM_SCHEMAS.education>;
/** The year box starts empty; the schema coerces the typed text to a number. */
const EMPTY_YEAR = "" as unknown as number;
const blankEducation = {
  qualification: "",
  institution: "",
  year: EMPTY_YEAR,
  grade: "",
  certificateKey: "",
};

export function EducationStep({
  initial,
  busy,
  issues,
  onNext,
  onBack,
  applicationId,
  token,
}: StepProps & { initial: StaffApplicationData["education"]; applicationId: string; token: string }) {
  const form = useForm<EducationIn, unknown, EducationOut>({
    resolver: zodResolver(FORM_SCHEMAS.education),
    shouldFocusError: false,
    defaultValues: initial ?? { items: [blankEducation] },
  });
  const { register, handleSubmit, formState, setError, control, getValues, setValue } = form;
  const rows = useFieldArray({ control, name: "items" });
  const keys = useWatch({ control, name: "items" });
  const [uploading, setUploading] = useState(0);
  const trackUpload = useCallback((on: boolean) => setUploading((n) => n + (on ? 1 : -1)), []);
  useServerIssues(setError, issues);
  const { formProps, summary } = useStepSubmit(handleSubmit, onNext, { items: "Qualification" });
  const err = (p: string) => errorAt(formState.errors, p);
  const rootErr = listError(formState.errors, "items");
  return (
    <form {...formProps} className={ONE_ROW_FORM}>
      {summary}
      <p className="text-sm text-muted">
        List your degrees, teaching qualifications and other training, most recent first. You can attach a
        copy of each certificate now or bring originals to interview.
      </p>
      {rows.fields.map((f, i) => (
        <RepeaterRow
          key={f.id}
          legend={`Qualification ${i + 1}`}
          removeLabel={`Remove qualification ${i + 1}`}
          onRemove={rows.fields.length > 1 ? () => rows.remove(i) : undefined}
          removeDisabled={uploading > 0}
        >
          <TextField
            id={`edu-${i}-qualification`}
            label="Qualification"
            required
            error={err(`items.${i}.qualification`)}
            {...register(`items.${i}.qualification`)}
          />
          <TextField
            id={`edu-${i}-institution`}
            label="Institution"
            required
            error={err(`items.${i}.institution`)}
            {...register(`items.${i}.institution`)}
          />
          <TextField
            id={`edu-${i}-year`}
            label="Year awarded"
            required
            inputMode="numeric"
            maxLength={4}
            error={err(`items.${i}.year`)}
            {...register(`items.${i}.year`)}
          />
          <TextField
            id={`edu-${i}-grade`}
            label="Grade or class"
            error={err(`items.${i}.grade`)}
            {...register(`items.${i}.grade`)}
          />
          <input type="hidden" {...register(`items.${i}.certificateKey`)} />
          <CertificateUpload
            id={`edu-${i}-certificate`}
            name={`items.${i}.certificateKey`}
            slot={`education-${i}`}
            label={`Certificate for qualification ${i + 1}`}
            applicationId={applicationId}
            token={token}
            storedKey={keys?.[i]?.certificateKey || undefined}
            onChange={(key) => setValue(`items.${i}.certificateKey`, key, { shouldDirty: true })}
            onBusyChange={trackUpload}
          />
          {err(`items.${i}.certificateKey`) && (
            <p role="alert" className="text-xs font-medium text-danger sm:col-span-2">
              {err(`items.${i}.certificateKey`)}
            </p>
          )}
        </RepeaterRow>
      ))}
      {rootErr && (
        <p role="alert" className="text-sm font-medium text-danger">
          {rootErr}
        </p>
      )}
      {rows.fields.length < 12 && (
        <AddRowButton onClick={() => rows.append(blankEducation)}>Add a qualification</AddRowButton>
      )}
      <StepFooter
        busy={busy}
        hold={uploading > 0 ? "Wait for the certificate to finish uploading before you continue." : ""}
        onBack={() => onBack?.(getValues())}
      />
    </form>
  );
}

/* ───────────────────────────── 4. Current employment ───────────────────────────── */

type CurrentIn = z.input<typeof FORM_SCHEMAS.current>;
type CurrentOut = z.output<typeof FORM_SCHEMAS.current>;

export function CurrentStep({
  initial,
  busy,
  issues,
  onNext,
  onBack,
}: StepProps & { initial: StaffApplicationData["current"] }) {
  const form = useForm<CurrentIn, unknown, CurrentOut>({
    resolver: zodResolver(FORM_SCHEMAS.current),
    shouldFocusError: false,
    defaultValues: initial,
  });
  const { register, handleSubmit, formState, setError, control, getValues } = form;
  const employed = useWatch({ control, name: "employed" });
  useServerIssues(setError, issues);
  const { formProps, summary } = useStepSubmit(handleSubmit, onNext);
  const err = (p: string) => errorAt(formState.errors, p);
  const employedError = err("employed") && "Please choose yes or no";
  return (
    <form {...formProps} className={ONE_ROW_FORM}>
      {summary}
      <Controller
        control={control}
        name="employed"
        render={({ field }) => (
          <fieldset aria-describedby={employedError ? "employed-error" : undefined}>
            <legend className="mb-1 text-sm font-medium text-fg">
              Are you currently employed?
              <span className="ml-0.5 text-kiln-700" aria-hidden="true">
                *
              </span>
            </legend>
            <div className="flex flex-wrap gap-x-8">
              {[
                { value: true, label: "Yes" },
                { value: false, label: "No" },
              ].map((o) => (
                <label key={o.label} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                  <input
                    type="radio"
                    name={field.name}
                    checked={field.value === o.value}
                    onChange={() => field.onChange(o.value)}
                    onBlur={field.onBlur}
                    className="size-5 accent-[var(--primary)]"
                  />
                  {o.label}
                </label>
              ))}
            </div>
            {employedError && (
              <p id="employed-error" role="alert" className="mt-1 text-xs font-medium text-danger">
                {employedError}
              </p>
            )}
          </fieldset>
        )}
      />
      {employed === false && (
        <p className="text-sm text-muted">
          No problem. Add your most recent jobs on the next step, and explain any time out of work in your
          personal statement.
        </p>
      )}
      {employed === true && (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="employer"
            label="Employer"
            required
            error={err("employer")}
            {...register("employer")}
          />
          <TextField id="role" label="Job title" required error={err("role")} {...register("role")} />
          <Controller
            control={control}
            name="since"
            render={({ field }) => (
              <MonthYearField
                id="since"
                name={field.name}
                label="Started"
                required
                value={field.value}
                onChange={field.onChange}
                error={err("since")}
              />
            )}
          />
          <TextField
            id="noticePeriod"
            label="Notice period"
            error={err("noticePeriod")}
            {...register("noticePeriod")}
          />
          <TextareaField
            id="reasonForLeaving"
            label="Why are you looking to move?"
            hint="Optional."
            rows={3}
            wrap="sm:col-span-2"
            error={err("reasonForLeaving")}
            {...register("reasonForLeaving")}
          />
        </div>
      )}
      <StepFooter busy={busy} onBack={() => onBack?.(getValues())} />
    </form>
  );
}

/* ───────────────────────────── 5. Employment history ───────────────────────────── */

type HistoryIn = z.input<typeof FORM_SCHEMAS.history>;
type HistoryOut = z.output<typeof FORM_SCHEMAS.history>;
const blankJob = { employer: "", role: "", from: "", to: "", reasonForLeaving: "" };

/** Persistent polite live region so a newly found gap is announced; the warning never blocks Next. */
export function GapWarning({ gaps, where }: { gaps: Gap[]; where: "history" | "statement" }) {
  return (
    <div aria-live="polite">
      {gaps.length > 0 && (
        <div className="rounded-lg border border-warning/50 bg-warning-bg px-4 py-3 text-sm text-warning">
          <p className="flex items-center gap-2 font-semibold">
            <TriangleAlert className="size-5 shrink-0" aria-hidden />
            Warning: {gaps.length === 1 ? "a gap" : `${gaps.length} gaps`} in your employment
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            {gaps.map((g) => (
              <li key={g.from}>{describeGap(g)}</li>
            ))}
          </ul>
          <p className="mt-2">
            {where === "history"
              ? "Safer recruitment means we ask about any gap of three months or more. This will not stop you continuing. Please explain each one in your personal statement."
              : "Please explain these gaps in your statement."}
          </p>
        </div>
      )}
    </div>
  );
}

export function HistoryStep({
  initial,
  current,
  busy,
  issues,
  onNext,
  onBack,
}: StepProps & { initial: StaffApplicationData["history"]; current: StaffApplicationData["current"] }) {
  const form = useForm<HistoryIn, unknown, HistoryOut>({
    resolver: zodResolver(FORM_SCHEMAS.history),
    shouldFocusError: false,
    defaultValues: initial ?? { items: [] },
  });
  const { register, handleSubmit, formState, setError, control, getValues } = form;
  const rows = useFieldArray({ control, name: "items" });
  const watched = useWatch({ control, name: "items" });
  useServerIssues(setError, issues);
  const { formProps, summary } = useStepSubmit(handleSubmit, onNext, { items: "Previous job" });
  const err = (p: string) => errorAt(formState.errors, p);
  const gaps = useMemo(
    () => gapsFor({ history: { items: watched ?? [] }, current }, currentMonthIst()),
    [watched, current],
  );
  return (
    <form {...formProps} className={ONE_ROW_FORM}>
      {summary}
      <p className="text-sm text-muted">
        Add every job since leaving education, apart from the current one you gave on the last step. If this
        is your first job, leave this blank and continue.
      </p>
      <GapWarning gaps={gaps} where="history" />
      {rows.fields.map((f, i) => (
        <RepeaterRow
          key={f.id}
          legend={`Previous job ${i + 1}`}
          removeLabel={`Remove job ${i + 1}`}
          onRemove={() => rows.remove(i)}
        >
          <TextField
            id={`job-${i}-employer`}
            label="Employer"
            required
            error={err(`items.${i}.employer`)}
            {...register(`items.${i}.employer`)}
          />
          <TextField
            id={`job-${i}-role`}
            label="Job title"
            required
            error={err(`items.${i}.role`)}
            {...register(`items.${i}.role`)}
          />
          <Controller
            control={control}
            name={`items.${i}.from`}
            render={({ field }) => (
              <MonthYearField
                id={`job-${i}-from`}
                name={field.name}
                label="From"
                required
                value={field.value}
                onChange={field.onChange}
                error={err(`items.${i}.from`)}
              />
            )}
          />
          <Controller
            control={control}
            name={`items.${i}.to`}
            render={({ field }) => (
              <MonthYearField
                id={`job-${i}-to`}
                name={field.name}
                label="To"
                required
                value={field.value}
                onChange={field.onChange}
                error={err(`items.${i}.to`)}
              />
            )}
          />
          <TextareaField
            id={`job-${i}-reason`}
            label="Reason for leaving"
            rows={2}
            wrap="sm:col-span-2"
            error={err(`items.${i}.reasonForLeaving`)}
            {...register(`items.${i}.reasonForLeaving`)}
          />
        </RepeaterRow>
      ))}
      {rows.fields.length < 20 && (
        <AddRowButton onClick={() => rows.append(blankJob)}>Add a job</AddRowButton>
      )}
      <StepFooter busy={busy} onBack={() => onBack?.(getValues())} />
    </form>
  );
}

/* ───────────────────────────── 6. Subjects & interests ───────────────────────────── */

type InterestsIn = z.input<typeof FORM_SCHEMAS.interests>;
type InterestsOut = z.output<typeof FORM_SCHEMAS.interests>;

export function InterestsStep({
  initial,
  busy,
  issues,
  onNext,
  onBack,
}: StepProps & { initial: StaffApplicationData["interests"] }) {
  const form = useForm<InterestsIn, unknown, InterestsOut>({
    resolver: zodResolver(FORM_SCHEMAS.interests),
    shouldFocusError: false,
    defaultValues: initial ?? { subjects: [], phases: [] },
  });
  const { register, handleSubmit, formState, setError, control, getValues } = form;
  const subjects = useWatch({ control, name: "subjects" }) ?? [];
  const phases = useWatch({ control, name: "phases" }) ?? [];
  useServerIssues(setError, issues);
  const { formProps, summary } = useStepSubmit(handleSubmit, onNext);
  const err = (p: string) => errorAt(formState.errors, p);
  return (
    <form {...formProps} className="space-y-8">
      {summary}
      <ChipGroup
        legend="Subjects and areas you can teach or support"
        hint="Choose up to eight."
        idPrefix="subjects"
        options={SUBJECTS}
        selected={subjects}
        max={8}
        error={err("subjects")}
        register={() => register("subjects")}
      />
      <ChipGroup
        legend="Phases you would like to work in"
        idPrefix="phases"
        options={PHASES}
        selected={phases}
        error={err("phases")}
        register={() => register("phases")}
      />
      <TextareaField
        id="interests"
        label="Interests and what you could offer beyond the classroom"
        hint="Optional. Clubs, sport, music, outdoor learning, boarding duties."
        rows={4}
        error={err("interests")}
        {...register("interests")}
      />
      <StepFooter busy={busy} onBack={() => onBack?.(getValues())} />
    </form>
  );
}

/* ───────────────────────────── 7. Personal statement ───────────────────────────── */

type StatementIn = z.input<typeof FORM_SCHEMAS.statement>;
type StatementOut = z.output<typeof FORM_SCHEMAS.statement>;

export function StatementStep({
  initial,
  gaps,
  busy,
  issues,
  onNext,
  onBack,
}: StepProps & { initial: StaffApplicationData["statement"]; gaps: Gap[] }) {
  const form = useForm<StatementIn, unknown, StatementOut>({
    resolver: zodResolver(FORM_SCHEMAS.statement),
    shouldFocusError: false,
    defaultValues: initial ?? { text: "" },
  });
  const { register, handleSubmit, formState, setError, control, getValues } = form;
  const text = useWatch({ control, name: "text" }) ?? "";
  useServerIssues(setError, issues);
  const { formProps, summary } = useStepSubmit(handleSubmit, onNext);
  const words = wordCount(text);
  const state = words < STATEMENT_WORDS.min ? "short" : words > STATEMENT_WORDS.max ? "long" : "ok";
  const err = errorAt(formState.errors, "text");
  return (
    <form {...formProps} className={ONE_ROW_FORM}>
      {summary}
      <p className="text-sm text-muted">
        Tell us why you want this role and this school, what you would bring, and what you want to learn.
        {gaps.length > 0 && " Please also explain the gaps in your employment listed below."}
      </p>
      <GapWarning gaps={gaps} where="statement" />
      <div>
        <TextareaField
          id="statement"
          label="Personal statement"
          required
          rows={14}
          error={err}
          aria-describedby={`statement-count${err ? " statement-error" : ""}`}
          {...register("text")}
        />
        <p
          id="statement-count"
          className={cn("mt-2 text-sm", state === "ok" ? "text-muted" : "font-medium text-warning")}
        >
          <span aria-hidden>{state === "ok" ? "✓ " : state === "long" ? "▲ " : "• "}</span>
          {words} {words === 1 ? "word" : "words"} · write {STATEMENT_WORDS.min} to {STATEMENT_WORDS.max}
          {state === "short" && ` (${STATEMENT_WORDS.min - words} more to go)`}
          {state === "long" && ` (${words - STATEMENT_WORDS.max} over)`}
        </p>
        {/* Changes only when the word count crosses a limit, so it does not announce every keystroke. */}
        <p role="status" className="sr-only">
          {state === "ok"
            ? "Statement length is within the limits."
            : state === "short"
              ? "Statement is below the minimum length."
              : "Statement is over the maximum length."}
        </p>
      </div>
      <StepFooter busy={busy} onBack={() => onBack?.(getValues())} />
    </form>
  );
}

/* ───────────────────────────── 8. References ───────────────────────────── */

type ReferencesIn = z.input<typeof FORM_SCHEMAS.references>;
type ReferencesOut = z.output<typeof FORM_SCHEMAS.references>;
const blankReferee = {
  name: "",
  role: "",
  organisation: "",
  email: "",
  phone: "",
  relationship: "",
  isCurrentEmployer: false,
};

export function ReferencesStep({
  initial,
  busy,
  issues,
  onNext,
  onBack,
}: StepProps & { initial: StaffApplicationData["references"] }) {
  const form = useForm<ReferencesIn, unknown, ReferencesOut>({
    resolver: zodResolver(FORM_SCHEMAS.references),
    shouldFocusError: false,
    defaultValues: initial ?? { items: [blankReferee, blankReferee] },
  });
  const { register, handleSubmit, formState, setError, control, getValues } = form;
  const rows = useFieldArray({ control, name: "items" });
  useServerIssues(setError, issues);
  const { formProps, summary } = useStepSubmit(handleSubmit, onNext, { items: "Referee" });
  const err = (p: string) => errorAt(formState.errors, p);
  const rootErr = listError(formState.errors, "items");
  return (
    <form {...formProps} className={ONE_ROW_FORM}>
      {summary}
      <p className="text-sm text-muted" id="references-help">
        Give two referees (up to four). One must be your current employer, or your most recent one if you are
        not working now. Safer recruitment means we may contact referees before interview.
      </p>
      {rows.fields.map((f, i) => (
        <RepeaterRow
          key={f.id}
          legend={`Referee ${i + 1}`}
          removeLabel={`Remove referee ${i + 1}`}
          onRemove={rows.fields.length > 2 ? () => rows.remove(i) : undefined}
        >
          <TextField
            id={`ref-${i}-name`}
            label="Full name"
            required
            error={err(`items.${i}.name`)}
            {...register(`items.${i}.name`)}
          />
          <TextField
            id={`ref-${i}-role`}
            label="Job title"
            required
            error={err(`items.${i}.role`)}
            {...register(`items.${i}.role`)}
          />
          <TextField
            id={`ref-${i}-organisation`}
            label="Organisation"
            required
            error={err(`items.${i}.organisation`)}
            {...register(`items.${i}.organisation`)}
          />
          <TextField
            id={`ref-${i}-relationship`}
            label="How do they know you?"
            required
            error={err(`items.${i}.relationship`)}
            {...register(`items.${i}.relationship`)}
          />
          <TextField
            id={`ref-${i}-email`}
            label="Email"
            type="email"
            required
            error={err(`items.${i}.email`)}
            {...register(`items.${i}.email`)}
          />
          <TextField
            id={`ref-${i}-phone`}
            label="Phone"
            type="tel"
            inputMode="tel"
            error={err(`items.${i}.phone`)}
            {...register(`items.${i}.phone`)}
          />
          <CheckField
            id={`ref-${i}-current`}
            className="sm:col-span-2"
            {...register(`items.${i}.isCurrentEmployer`)}
          >
            This referee is my current (or most recent) employer
          </CheckField>
        </RepeaterRow>
      ))}
      {rootErr && (
        <p role="alert" className="text-sm font-medium text-danger">
          {rootErr}
        </p>
      )}
      {rows.fields.length < 4 && (
        <AddRowButton onClick={() => rows.append(blankReferee)}>Add a referee</AddRowButton>
      )}
      <StepFooter busy={busy} onBack={() => onBack?.(getValues())} />
    </form>
  );
}

/* ───────────────────────────── 9. Declaration ───────────────────────────── */

type DeclarationIn = z.input<typeof FORM_SCHEMAS.declaration>;
type DeclarationOut = z.output<typeof FORM_SCHEMAS.declaration>;

export type SubmitExtras = { captchaToken?: string; captchaAnswer?: string; website?: string };
export type SubmitResult =
  | { ok: true }
  /** `flagged`: the server marked fields on this step, and they have already taken focus. */
  | { ok: false; message: string; captcha?: boolean; flagged?: boolean };

function YesNoQuestion({
  legend,
  name,
  detailName,
  declared,
  error,
  detailError,
  register,
}: {
  legend: string;
  name: "convictions" | "pendingAction";
  detailName: "convictionsDetail" | "pendingActionDetail";
  declared: boolean;
  error?: string;
  detailError?: string;
  register: UseFormRegister<DeclarationIn>;
}) {
  return (
    <fieldset aria-describedby={error ? `${name}-error` : undefined}>
      <legend className="mb-1 text-sm font-medium text-fg">
        {legend}
        <span className="ml-0.5 text-kiln-700" aria-hidden="true">
          *
        </span>
      </legend>
      {[
        { value: "NONE", label: "No" },
        { value: "DECLARE", label: "Yes, I need to give details" },
      ].map((o) => (
        <label key={o.value} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input
            type="radio"
            value={o.value}
            className="size-5 accent-[var(--primary)]"
            {...register(name)}
          />
          {o.label}
        </label>
      ))}
      {error && (
        <p id={`${name}-error`} role="alert" className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      )}
      {declared && (
        <TextareaField
          id={detailName}
          label="Details"
          required
          rows={4}
          wrap="mt-3"
          hint="Include dates, the country and the outcome. Declaring something does not automatically rule you out."
          error={detailError}
          {...register(detailName)}
        />
      )}
    </fieldset>
  );
}

export function DeclarationStep({
  initial,
  busy,
  issues,
  onBack,
  onSubmit,
}: Omit<StepProps, "onNext"> & {
  initial: StaffApplicationData["declaration"];
  onSubmit: (values: DeclarationOut, extras: SubmitExtras) => Promise<SubmitResult>;
}) {
  const form = useForm<DeclarationIn, unknown, DeclarationOut>({
    resolver: zodResolver(FORM_SCHEMAS.declaration),
    shouldFocusError: false,
    defaultValues: initial,
  });
  const { register, handleSubmit, formState, setError, control, getValues } = form;
  const convictions = useWatch({ control, name: "convictions" });
  const pendingAction = useWatch({ control, name: "pendingAction" });
  useServerIssues(setError, issues);
  const err = (p: string) => errorAt(formState.errors, p);

  const captchaRef = useRef<CaptchaHandle>(null);
  const captcha = useRef<{ token?: string; answer?: string }>({});
  const honeypot = useRef<HTMLInputElement>(null);
  const [captchaError, setCaptchaError] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const onCaptcha = useCallback((v: { token?: string; answer?: string }) => {
    captcha.current = v;
    setCaptchaError(undefined);
  }, []);

  const failureAlert = useAlertFocus();

  const { formProps, summary } = useStepSubmit(handleSubmit, async (values: DeclarationOut) => {
    setFailure(undefined);
    const result = await onSubmit(values, {
      captchaToken: captcha.current.token,
      captchaAnswer: captcha.current.answer,
      website: honeypot.current?.value,
    });
    if (result.ok) return;
    if (result.captcha) setCaptchaError(result.message);
    else {
      setFailure(result.message);
      if (!result.flagged) failureAlert.announce();
    }
    captchaRef.current?.refresh();
  });

  return (
    <form {...formProps} className={ONE_ROW_FORM}>
      {summary}
      {/* Honeypot: hidden from people and assistive technology. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 overflow-hidden">
        <label htmlFor="declaration-website">Website</label>
        <input id="declaration-website" ref={honeypot} tabIndex={-1} autoComplete="off" />
      </div>

      <section aria-labelledby="safeguarding-heading" className="space-y-2 rounded-lg bg-cream p-4 sm:p-5">
        <h3 id="safeguarding-heading" className="font-serif text-xl text-primary">
          Safeguarding
        </h3>
        <p className="text-sm">
          {school.name} is committed to safeguarding and promoting the welfare of children. Every appointment
          depends on identity, qualification and reference checks, police verification where it applies, and a
          satisfactory induction. We read the whole application, not only the parts that suit us.
        </p>
        <CheckField id="safeguarding" error={err("safeguarding")} {...register("safeguarding")}>
          I understand this and will take part in these checks if I am offered a post.
        </CheckField>
      </section>

      <YesNoQuestion
        legend="Have you ever been convicted of a criminal offence, or received a caution or equivalent, in any country?"
        name="convictions"
        detailName="convictionsDetail"
        declared={convictions === "DECLARE"}
        error={err("convictions")}
        detailError={err("convictionsDetail")}
        register={register}
      />
      <YesNoQuestion
        legend="Is there any criminal or disciplinary action pending against you, or any investigation about your conduct with children?"
        name="pendingAction"
        detailName="pendingActionDetail"
        declared={pendingAction === "DECLARE"}
        error={err("pendingAction")}
        detailError={err("pendingActionDetail")}
        register={register}
      />

      <fieldset className="space-y-1">
        <legend className="sr-only">Consent and accuracy</legend>
        <CheckField id="consent" error={err("consent")} {...register("consent")}>
          I consent to {school.shortName} processing this application, and contacting my referees, for
          recruitment. See the{" "}
          <Link href="/privacy" target="_blank" className="underline">
            privacy policy
          </Link>
          .
        </CheckField>
        <CheckField id="truthful" error={err("truthful")} {...register("truthful")}>
          The information in this application is true and complete. I understand that a false statement can
          lead to withdrawal of an offer or dismissal.
        </CheckField>
      </fieldset>

      <CaptchaField
        ref={captchaRef}
        id="staff-application-captcha"
        error={captchaError}
        onChange={onCaptcha}
      />

      {failure && (
        <p
          ref={failureAlert.ref}
          tabIndex={-1}
          role="alert"
          className="rounded-md bg-danger-bg px-4 py-3 text-sm text-danger"
        >
          {failure}
        </p>
      )}
      <StepFooter busy={busy} onBack={() => onBack?.(getValues())} nextLabel="Submit application" />
    </form>
  );
}
