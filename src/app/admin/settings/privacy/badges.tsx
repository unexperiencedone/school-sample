import { CircleCheck, CircleX, Clock, Download, Eraser } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status }: { status: string }) {
  if (status === "DONE")
    return (
      <Badge tone="success">
        <CircleCheck className="size-3.5" aria-hidden /> Done
      </Badge>
    );
  if (status === "REJECTED")
    return (
      <Badge tone="neutral">
        <CircleX className="size-3.5" aria-hidden /> Rejected
      </Badge>
    );
  return (
    <Badge tone="warning">
      <Clock className="size-3.5" aria-hidden /> Open
    </Badge>
  );
}

export function KindLabel({ kind }: { kind: string }) {
  const deletion = kind === "DELETION";
  const Icon = deletion ? Eraser : Download;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Icon className="size-4 text-muted" aria-hidden /> {deletion ? "Deletion" : "Data export"}
    </span>
  );
}
