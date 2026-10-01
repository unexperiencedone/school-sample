import type { ApplicationStage, LeadStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { LEAD_STATUS_LABEL } from "@/lib/services/leads";
import { STAGE_LABEL } from "@/lib/services/admissions";

const LEAD_TONE: Record<
  LeadStatus,
  "neutral" | "primary" | "accent" | "success" | "warning" | "danger" | "info"
> = {
  NEW: "info",
  CONTACTED: "primary",
  TOUR_BOOKED: "accent",
  TOUR_DONE: "accent",
  APPLIED: "warning",
  ADMITTED: "success",
  LOST: "neutral",
};

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return <Badge tone={LEAD_TONE[status]}>{LEAD_STATUS_LABEL[status]}</Badge>;
}

const STAGE_TONE: Record<
  ApplicationStage,
  "neutral" | "primary" | "accent" | "success" | "warning" | "danger" | "info"
> = {
  DRAFT: "neutral",
  REGISTERED: "info",
  DOCUMENTS: "primary",
  ASSESSMENT: "primary",
  REVIEW: "warning",
  OFFER: "accent",
  FEE_PAID: "success",
  ADMITTED: "success",
  WAITLISTED: "warning",
  REJECTED: "danger",
  WITHDRAWN: "neutral",
};

export function StageBadge({ stage }: { stage: ApplicationStage }) {
  return <Badge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</Badge>;
}
