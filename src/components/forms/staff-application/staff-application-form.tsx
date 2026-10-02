"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { formatDate } from "@/lib/dates";
import { STEPS, type StaffApplicationData, type StepKey } from "@/lib/schemas/staff-application";
import { cn } from "@/lib/utils";
import { ApiFailure, fetchDraft, postApplication } from "./api";
import { currentMonthIst, FORM_SCHEMAS, gapsFor, type Issue } from "./rules";
import {
  CurrentStep,
  DeclarationStep,
  EducationStep,
  FamilyStep,
  HistoryStep,
  InterestsStep,
  PersonalStep,
  ReferencesStep,
  StatementStep,
  type SubmitExtras,
  type SubmitResult,
  type VacancyOption,
} from "./steps";

type Session = { id: string; ref: string; token: string };
type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "unsaved" }
  | { kind: "error"; message: string };

const STORAGE_KEY = "ah_staff_application";
/** Codes after which the draft cannot be continued with the token we hold. */
const FATAL_CODES = new Set(["INVALID_TOKEN", "EXPIRED", "ALREADY_SUBMITTED", "UNAUTHENTICATED"]);

function readSession(): Session | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Session> | null;
    return v?.id && v.token && v.ref ? { id: v.id, ref: v.ref, token: v.token } : null;
  } catch {
    return null;
  }
}
function writeSession(s: Session | null) {
  try {
    if (s) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage blocked: the form still works for this page view, and the emailed link resumes it */
  }
}

/** Sets one step's answers. The key is a runtime step name, so TypeScript can't relate it to the value. */
const withStep = (d: StaffApplicationData, key: StepKey, value: unknown) =>
  ({ ...d, [key]: value }) as StaffApplicationData;

export function StaffApplicationForm({
  vacancies,
  initialVacancy,
  resume,
}: {
  vacancies: VacancyOption[];
  initialVacancy: string;
  resume?: { id: string; token: string };
}) {
  const [booting, setBooting] = useState(Boolean(resume));
  const [fatal, setFatal] = useState<string | null>(null);
  const [done, setDone] = useState<{ ref: string; already: boolean } | null>(null);
  const [data, setData] = useState<StaffApplicationData>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [vacancySlug, setVacancySlug] = useState(initialVacancy);
  const [resumedVacancy, setResumedVacancy] = useState<VacancyOption | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [issues, setIssues] = useState<Partial<Record<StepKey, Issue[]>>>({});
  const [busy, setBusy] = useState(false);
  const session = useRef<Session | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const options = useMemo(
    () =>
      resumedVacancy && !vacancies.some((v) => v.slug === resumedVacancy.slug)
        ? [...vacancies, resumedVacancy]
        : vacancies,
    [vacancies, resumedVacancy],
  );
  const vacancy = options.find((v) => v.slug === vacancySlug);

  const focusHeading = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    requestAnimationFrame(() => document.getElementById("apply-heading")?.focus());
  };
  const go = (index: number) => {
    setStepIndex(index);
    focusHeading();
  };

  /** Saves run one at a time, so a quick Back then Next can't arrive out of order. */
  const enqueue = <T,>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.current.then(fn, fn);
    queue.current = next.catch(() => undefined);
    return next;
  };

  const failWith = (e: unknown, index?: number): string => {
    const f = e instanceof ApiFailure ? e : null;
    if (f && FATAL_CODES.has(f.code)) {
      writeSession(null);
      setFatal(f.message);
    }
    if (f?.details.issues && index !== undefined)
      setIssues((s) => ({ ...s, [STEPS[index]!.key]: f.details.issues }));
    return f?.message ?? "Something went wrong. Please try again.";
  };

  const persist = (index: number, values: unknown) =>
    enqueue(async () => {
      setSave({ kind: "saving" });
      try {
        const s = session.current;
        const res = await postApplication({
          id: s?.id,
          token: s?.token,
          vacancySlug,
          step: index + 1,
          data: values,
          action: "save",
        });
        if (res.resumeToken) {
          const created = { id: res.id, ref: res.ref, token: res.resumeToken };
          session.current = created;
          writeSession(created);
          setRef(res.ref);
        }
        setSave({ kind: "saved", at: new Date() });
        return true;
      } catch (e) {
        const message = failWith(e, index);
        setSave({ kind: "error", message });
        setProblem(message);
        return false;
      }
    });

  const next = async (index: number, values: unknown) => {
    setProblem(null);
    setBusy(true);
    try {
      if (!(await persist(index, values))) return;
      const key = STEPS[index]!.key;
      setData((d) => withStep(d, key, values));
      setIssues((s) => ({ ...s, [key]: undefined }));
      go(index + 1);
    } finally {
      setBusy(false);
    }
  };

  const back = (index: number, raw: unknown) => {
    const key = STEPS[index]!.key;
    setProblem(null);
    setData((d) => withStep(d, key, raw));
    if (FORM_SCHEMAS[key].safeParse(raw).success) void persist(index, raw);
    else setSave({ kind: "unsaved" });
    go(index - 1);
  };

  const submit = async (values: unknown, extras: SubmitExtras): Promise<SubmitResult> => {
    const s = session.current;
    if (!s) return { ok: false, message: "Please start from the first step." };
    setProblem(null);
    setBusy(true);
    setData((d) => withStep(d, "declaration", values));
    try {
      await postApplication({
        id: s.id,
        token: s.token,
        step: STEPS.length,
        data: values,
        action: "submit",
        ...extras,
      });
      track("vacancy_apply", { vacancy: vacancySlug || "general" });
      writeSession(null);
      setDone({ ref: s.ref, already: false });
      focusHeading();
      return { ok: true };
    } catch (e) {
      const f = e instanceof ApiFailure ? e : null;
      if (f?.code === "INCOMPLETE" && f.details.steps && f.details.firstStep) {
        setIssues(f.details.steps as Partial<Record<StepKey, Issue[]>>);
        if (f.details.firstStep !== STEPS.length) {
          setProblem(
            `Some answers need attention before you can submit. We have taken you to step ${f.details.firstStep}.`,
          );
          go(f.details.firstStep - 1);
        }
      }
      return { ok: false, message: failWith(e), captcha: f?.code === "CAPTCHA_FAILED" };
    } finally {
      setBusy(false);
    }
  };

  /** Continue a draft from the emailed link, or from this browser tab's own session after a reload. */
  useEffect(() => {
    const stored = resume ?? readSession();
    if (!stored) return;
    let cancelled = false;
    (async () => {
      try {
        const d = await fetchDraft(stored.id, stored.token);
        if (cancelled) return;
        if (d.status !== "DRAFT") {
          writeSession(null);
          setDone({ ref: d.ref, already: true });
          return;
        }
        const restored = { id: d.id, ref: d.ref, token: stored.token };
        session.current = restored;
        writeSession(restored);
        setRef(d.ref);
        setData(d.data);
        setStepIndex(Math.min(Math.max(d.currentStep, 1), STEPS.length) - 1);
        if (d.vacancy) setResumedVacancy({ ...d.vacancy, closesAt: "" });
        setVacancySlug(initialVacancy || d.vacancy?.slug || "");
        setNotice(`Welcome back. We have restored your saved answers (reference ${d.ref}).`);
        if (resume) window.history.replaceState(null, "", window.location.pathname);
      } catch (e) {
        if (cancelled) return;
        if (resume || (e instanceof ApiFailure && FATAL_CODES.has(e.code))) {
          writeSession(null);
          setFatal(e instanceof ApiFailure ? e.message : "We couldn't load your draft.");
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resume, initialVacancy]);

  const restart = () => {
    writeSession(null);
    session.current = null;
    window.location.assign("/careers/apply");
  };

  if (done) return <ApplicationReceived reference={done.ref} already={done.already} role={vacancy?.title} />;
  if (fatal)
    return (
      <div role="alert" className="rounded-lg border border-danger/40 bg-danger-bg p-6">
        <h2 className="font-serif text-2xl text-danger">We can&apos;t continue this application</h2>
        <p className="mt-2 text-sm">{fatal}</p>
        <Button className="mt-5" size="lg" onClick={restart}>
          Start a new application
        </Button>
      </div>
    );
  if (booting)
    return (
      <p role="status" className="flex items-center gap-3 py-10 text-muted">
        <Loader2 className="size-5 animate-spin" aria-hidden /> Loading your saved application…
      </p>
    );

  const step = STEPS[stepIndex]!;
  const key = step.key;
  const common = { busy, issues: issues[key] };
  const gaps = gapsFor(data, currentMonthIst());
  const s = session.current;

  return (
    <div className="min-w-0">
      {vacancy ? (
        <div className="mb-8 rounded-lg border border-line bg-cream/60 p-4 text-sm sm:p-5">
          <p className="t-eyebrow">You are applying for</p>
          <p className="mt-1 font-serif text-2xl text-primary">{vacancy.title}</p>
          <p className="mt-1 text-muted">
            {vacancy.department} · {vacancy.employment}
            {vacancy.closesAt && ` · closes ${formatDate(vacancy.closesAt, "d MMMM yyyy")}`}
          </p>
          <Link
            href={`/careers/vacancies/${vacancy.slug}`}
            className="mt-2 inline-block underline"
            target="_blank"
          >
            Read the role description (opens in a new tab)
          </Link>
        </div>
      ) : (
        <p className="mb-8 text-sm text-muted">
          General application. You can choose a specific vacancy in step 1.
        </p>
      )}

      <ol className="mb-8 grid grid-cols-9 gap-1" aria-label="Application progress">
        {STEPS.map((st, i) => (
          <li key={st.key} aria-current={i === stepIndex ? "step" : undefined} className="min-w-0">
            <span className="sr-only">
              Step {i + 1}: {st.title}
              {i < stepIndex ? ", completed" : i === stepIndex ? ", current step" : ""}
            </span>
            <span
              aria-hidden
              className={cn(
                "block h-1.5 rounded-full",
                i < stepIndex ? "bg-marigold-500" : i === stepIndex ? "bg-damson-800" : "bg-sand",
              )}
            />
            <span
              aria-hidden
              className={cn(
                "mt-2 hidden truncate text-xs xl:block",
                i === stepIndex ? "font-semibold text-fg" : "text-muted",
              )}
            >
              {i + 1}. {st.title}
            </span>
          </li>
        ))}
      </ol>

      <h2 id="apply-heading" tabIndex={-1} className="t-h3 mb-1 text-primary focus:outline-none">
        Step {stepIndex + 1} of {STEPS.length} · {step.title}
      </h2>
      <p
        role="status"
        aria-live="polite"
        className="mb-6 flex min-h-6 flex-wrap items-center gap-x-3 text-sm text-muted"
      >
        {ref && <span>Reference {ref}</span>}
        <SaveLabel state={save} />
      </p>

      {notice && (
        <p className="mb-6 rounded-md bg-info-bg px-4 py-3 text-sm text-info" role="status">
          {notice}
        </p>
      )}
      {problem && (
        <p role="alert" className="mb-6 rounded-md bg-danger-bg px-4 py-3 text-sm text-danger">
          {problem}
        </p>
      )}

      <div key={stepIndex}>
        {key === "personal" && (
          <PersonalStep
            {...common}
            initial={data.personal}
            vacancies={options}
            vacancySlug={vacancySlug}
            onVacancyChange={setVacancySlug}
            onNext={(v) => next(stepIndex, v)}
          />
        )}
        {key === "family" && (
          <FamilyStep
            {...common}
            initial={data.family}
            onNext={(v) => next(stepIndex, v)}
            onBack={(r) => back(stepIndex, r)}
          />
        )}
        {key === "education" && s && (
          <EducationStep
            {...common}
            initial={data.education}
            applicationId={s.id}
            token={s.token}
            onNext={(v) => next(stepIndex, v)}
            onBack={(r) => back(stepIndex, r)}
          />
        )}
        {key === "current" && (
          <CurrentStep
            {...common}
            initial={data.current}
            onNext={(v) => next(stepIndex, v)}
            onBack={(r) => back(stepIndex, r)}
          />
        )}
        {key === "history" && (
          <HistoryStep
            {...common}
            initial={data.history}
            current={data.current}
            onNext={(v) => next(stepIndex, v)}
            onBack={(r) => back(stepIndex, r)}
          />
        )}
        {key === "interests" && (
          <InterestsStep
            {...common}
            initial={data.interests}
            onNext={(v) => next(stepIndex, v)}
            onBack={(r) => back(stepIndex, r)}
          />
        )}
        {key === "statement" && (
          <StatementStep
            {...common}
            initial={data.statement}
            gaps={gaps}
            onNext={(v) => next(stepIndex, v)}
            onBack={(r) => back(stepIndex, r)}
          />
        )}
        {key === "references" && (
          <ReferencesStep
            {...common}
            initial={data.references}
            onNext={(v) => next(stepIndex, v)}
            onBack={(r) => back(stepIndex, r)}
          />
        )}
        {key === "declaration" && (
          <DeclarationStep
            {...common}
            initial={data.declaration}
            onSubmit={submit}
            onBack={(r) => back(stepIndex, r)}
          />
        )}
      </div>
    </div>
  );
}

function SaveLabel({ state }: { state: SaveState }) {
  switch (state.kind) {
    case "saving":
      return (
        <span className="inline-flex items-center gap-1.5">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Saving…
        </span>
      );
    case "saved":
      return (
        <span className="inline-flex items-center gap-1.5 text-success">
          <CheckCircle2 className="size-4" aria-hidden />
          Saved at {state.at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
        </span>
      );
    case "unsaved":
      return <span>Not saved yet. Complete this step to save it.</span>;
    case "error":
      return <span className="text-danger">Not saved. {state.message}</span>;
    case "idle":
      return <span>Your answers save each time you move between steps.</span>;
  }
}

function ApplicationReceived({
  reference,
  already,
  role,
}: {
  reference: string;
  already: boolean;
  role?: string;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div className="rounded-lg border border-success/30 bg-success-bg/50 p-6 sm:p-10">
      <CheckCircle2 className="size-10 text-success" aria-hidden />
      <h2 ref={heading} tabIndex={-1} className="t-h2 mt-3 text-primary focus:outline-none">
        {already ? "This application has been submitted" : "Application received"}
      </h2>
      <p className="mt-3">
        Your reference is{" "}
        <strong className="font-mono text-lg" data-testid="application-ref">
          {reference}
        </strong>
        .{" "}
        {already
          ? "It can no longer be edited. Contact HR if something needs correcting."
          : `We have emailed a confirmation${role ? ` for ${role}` : ""}. Keep the reference in case you need to contact us.`}
      </p>
      <h3 className="mt-8 font-serif text-xl text-primary">What happens next</h3>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
        <li>HR checks your application against the role. Every application is read in full.</li>
        <li>
          We contact shortlisted candidates to arrange an interview, which usually includes a short lesson or
          task.
        </li>
        <li>Before any offer, we verify identity and qualifications and take up references.</li>
      </ol>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link href="/careers/vacancies">Back to vacancies</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/careers">Working at Aurelia Hall</Link>
        </Button>
      </div>
    </div>
  );
}
