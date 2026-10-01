import type {
  ApplicationStage,
  InstalmentStatus,
  InvoiceStatus,
  LeadStatus,
  PaymentStatus,
  RefundStatus,
} from "@prisma/client";
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

type Tone = "neutral" | "primary" | "accent" | "success" | "warning" | "danger" | "info";
const FEE_TONE: Record<InvoiceStatus | InstalmentStatus, Tone> = {
  PAID: "success",
  OVERDUE: "danger",
  PARTIAL: "warning",
  OPEN: "info",
  DUE: "info",
  DRAFT: "neutral",
  WAIVED: "neutral",
  VOID: "neutral",
};

/** Invoice or instalment status. The word is always shown; colour only reinforces it. */
export function FeeStatusBadge({ status }: { status: InvoiceStatus | InstalmentStatus }) {
  return <Badge tone={FEE_TONE[status]}>{status.toLowerCase()}</Badge>;
}

const PAYMENT_TONE: Record<PaymentStatus, Tone> = {
  CAPTURED: "success",
  FAILED: "danger",
  REFUNDED: "neutral",
  PARTIALLY_REFUNDED: "warning",
};
export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge tone={PAYMENT_TONE[status]}>
      {status === "CAPTURED" ? "received" : status.toLowerCase().replace("_", " ")}
    </Badge>
  );
}

const REFUND_TONE: Record<RefundStatus, Tone> = {
  REQUESTED: "info",
  APPROVED: "accent",
  REJECTED: "neutral",
  PROCESSED: "success",
  FAILED: "danger",
  CLOSED: "neutral",
};
export function RefundStatusBadge({ status }: { status: RefundStatus }) {
  return <Badge tone={REFUND_TONE[status]}>{status.toLowerCase()}</Badge>;
}
