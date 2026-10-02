import type { StaffApplicationData } from "@/lib/schemas/staff-application";
import type { Issue } from "./rules";

export type SaveResponse = {
  id: string;
  ref: string;
  status: "DRAFT" | "RECEIVED";
  currentStep: number;
  resumeToken?: string;
};

export type DraftResponse = {
  id: string;
  ref: string;
  status: string;
  currentStep: number;
  vacancy: { slug: string; title: string; department: string; employment: string } | null;
  data: StaffApplicationData;
  submittedAt: string | null;
};

export type SubmitFailureDetails = { firstStep?: number; steps?: Record<string, Issue[]>; issues?: Issue[] };

/** A failed call with the API's error envelope unpacked. */
export class ApiFailure extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details: SubmitFailureDetails & { fieldErrors?: Record<string, string[]> },
  ) {
    super(message);
  }
}

async function call<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init });
  } catch {
    throw new ApiFailure(
      "We couldn't reach the server. Check your connection and try again.",
      0,
      "NETWORK",
      {},
    );
  }
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: { code?: string; message?: string; details?: ApiFailure["details"] | null };
  };
  if (!res.ok)
    throw new ApiFailure(
      json.error?.message ?? "Something went wrong. Please try again.",
      res.status,
      json.error?.code ?? "ERROR",
      json.error?.details ?? {},
    );
  return json;
}

export type SaveBody = {
  id?: string;
  token?: string;
  vacancySlug?: string;
  step: number;
  data: unknown;
  action: "save" | "submit";
  captchaToken?: string;
  captchaAnswer?: string;
  website?: string;
};

export const postApplication = (body: SaveBody) =>
  call<SaveResponse>("/api/staff-applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const fetchDraft = (id: string, token: string) =>
  call<DraftResponse>(
    `/api/staff-applications/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`,
    {
      method: "GET",
    },
  );
