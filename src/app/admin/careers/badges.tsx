import type { StaffAppStatus, VacancyStatus } from "@prisma/client";
import { ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SCORE_MAX, STAGE_LABEL } from "@/lib/services/careers-admin-rules";

type Tone = "neutral" | "primary" | "accent" | "success" | "warning" | "danger" | "info";

const STAGE_TONE: Record<StaffAppStatus, Tone> = {
  DRAFT: "neutral",
  RECEIVED: "info",
  SHORTLISTED: "primary",
  INTERVIEW: "accent",
  OFFER: "warning",
  HIRED: "success",
  REJECTED: "danger",
};

/** The stage is always written out; colour only reinforces it. */
export function ApplicationStatusBadge({ status }: { status: StaffAppStatus }) {
  return <Badge tone={STAGE_TONE[status]}>{STAGE_LABEL[status]}</Badge>;
}

const VACANCY_TONE: Record<VacancyStatus, Tone> = { OPEN: "success", DRAFT: "neutral", CLOSED: "neutral" };

export function VacancyStatusBadge({ status }: { status: VacancyStatus }) {
  return <Badge tone={VACANCY_TONE[status]}>{status.toLowerCase()}</Badge>;
}

export function ScoreText({ score }: { score: number | null }) {
  return score === null ? (
    <span className="text-muted">Not scored</span>
  ) : (
    <span className="tabular-nums">
      {score}
      <span className="text-muted"> / {SCORE_MAX}</span>
    </span>
  );
}

/** Safeguarding declaration to read: an icon and words, never colour alone. */
export function FlagBadge() {
  return (
    <Badge tone="danger">
      <ShieldAlert className="size-3.5" aria-hidden /> Safeguarding flag
    </Badge>
  );
}
