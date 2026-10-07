import type { ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-sunken", className)} aria-hidden />;
}

export function EmptyState({
  title,
  children,
  action,
  icon,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong/60 px-6 py-14 text-center">
      <div className="mb-3 grid size-11 place-items-center rounded-full bg-sunken text-muted">
        {icon ?? <Inbox className="size-5" />}
      </div>
      <p className="font-medium text-fg">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  children,
  action,
}: {
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center rounded-lg border border-danger/30 bg-danger-bg px-6 py-10 text-center"
    >
      <AlertTriangle className="mb-2 size-6 text-danger" />
      <p className="font-medium text-danger">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-fg/80">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
