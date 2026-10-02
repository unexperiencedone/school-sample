"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { actionUser } from "@/lib/auth/session";
import { ApiError } from "@/lib/api";
import {
  addNote,
  addToStaffDirectory,
  createVacancy,
  deleteVacancy,
  moveStage,
  saveScorecard,
  updateStaffContact,
  updateVacancy,
} from "@/lib/services/careers-admin";
import { SCORE_CRITERIA } from "@/lib/services/careers-admin-rules";

export type ActionResult = { ok: true; message?: string; id?: string } | { ok: false; error: string };

async function run(
  fn: () => Promise<{ message?: string; id?: string } | void>,
  paths: string[],
): Promise<ActionResult> {
  try {
    const r = (await fn()) ?? {};
    paths.forEach((p) => revalidatePath(p));
    return { ok: true, ...r };
  } catch (e) {
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form" };
    if (e instanceof ApiError) return { ok: false, error: e.message };
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

const APPLICATION_PATHS = (id: string) => ["/admin/careers", `/admin/careers/${id}`, "/admin"];

export async function moveStageAction(id: string, to: string, reason?: string): Promise<ActionResult> {
  const user = await actionUser("careers:write");
  return run(async () => {
    await moveStage(user, id, to, reason);
    return { message: "Stage updated" };
  }, APPLICATION_PATHS(id));
}

export async function moveStageFormAction(id: string, form: FormData): Promise<ActionResult> {
  return moveStageAction(id, text(form, "to"), text(form, "reason"));
}

export async function saveScorecardAction(id: string, form: FormData): Promise<ActionResult> {
  const user = await actionUser("careers:write");
  return run(async () => {
    const input = Object.fromEntries(
      [...SCORE_CRITERIA.map((c) => c.key), "comment"].map((k) => [k, text(form, k) || undefined]),
    );
    const { score } = await saveScorecard(user, id, input);
    return { message: `Scorecard saved: ${score} out of ${SCORE_CRITERIA.length * 5}` };
  }, APPLICATION_PATHS(id));
}

export async function addNoteAction(id: string, form: FormData): Promise<ActionResult> {
  const user = await actionUser("careers:write");
  return run(async () => {
    await addNote(user, id, text(form, "body"));
    return { message: "Note added" };
  }, [`/admin/careers/${id}`]);
}

export async function addToStaffAction(id: string, form: FormData): Promise<ActionResult> {
  const user = await actionUser("careers:write");
  return run(async () => {
    const staff = await addToStaffDirectory(user, id, {
      firstName: text(form, "firstName"),
      lastName: text(form, "lastName"),
      designation: text(form, "designation"),
      department: text(form, "department"),
      phone: text(form, "phone"),
      joinedOn: text(form, "joinedOn"),
    });
    return { message: `${staff.firstName} ${staff.lastName} added to the staff directory`, id: staff.id };
  }, [`/admin/careers/${id}`, "/admin/careers/staff", "/admin"]);
}

function vacancyFields(form: FormData) {
  return {
    title: text(form, "title"),
    slug: text(form, "slug"),
    department: text(form, "department"),
    employment: text(form, "employment"),
    location: text(form, "location"),
    summary: text(form, "summary"),
    description: text(form, "description"),
    requirements: text(form, "requirements"),
    closesAt: text(form, "closesAt"),
    status: text(form, "status"),
  };
}

const VACANCY_PATHS = ["/admin/careers/vacancies", "/careers/vacancies", "/careers", "/admin"];

export async function createVacancyAction(form: FormData): Promise<ActionResult> {
  const user = await actionUser("careers:write");
  return run(async () => {
    const v = await createVacancy(user, vacancyFields(form));
    return { message: "Vacancy created", id: v.id };
  }, VACANCY_PATHS);
}

export async function updateVacancyAction(id: string, form: FormData): Promise<ActionResult> {
  const user = await actionUser("careers:write");
  return run(async () => {
    await updateVacancy(user, id, vacancyFields(form));
    return { message: "Vacancy saved" };
  }, [...VACANCY_PATHS, `/admin/careers/vacancies/${id}`]);
}

/** Close or reopen. Reopening a vacancy whose closing date has passed needs a new date. */
export async function setVacancyStatusAction(
  id: string,
  status: "OPEN" | "CLOSED",
  closesAt?: string,
): Promise<ActionResult> {
  const user = await actionUser("careers:write");
  return run(async () => {
    await updateVacancy(user, id, { status, ...(closesAt ? { closesAt } : {}) });
    return { message: status === "OPEN" ? "Vacancy reopened" : "Vacancy closed" };
  }, [...VACANCY_PATHS, `/admin/careers/vacancies/${id}`]);
}

export async function deleteVacancyAction(id: string): Promise<ActionResult> {
  const user = await actionUser("careers:write");
  return run(async () => {
    await deleteVacancy(user, id);
    return { message: "Vacancy deleted" };
  }, VACANCY_PATHS);
}

export async function updateStaffAction(id: string, form: FormData): Promise<ActionResult> {
  const user = await actionUser("careers:write");
  return run(async () => {
    await updateStaffContact(user, id, {
      designation: text(form, "designation"),
      department: text(form, "department"),
      phone: text(form, "phone"),
    });
    return { message: "Staff details updated" };
  }, ["/admin/careers/staff"]);
}
