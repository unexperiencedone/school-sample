import type { ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("bg-sunken animate-pulse rounded-md", className)} aria-hidden />;
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
    <div className="border-line-strong/60 flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-14 text-center">
      <div className="bg-sunken text-muted mb-3 grid size-11 place-items-center rounded-full">
        {icon ?? <Inbox className="size-5" />}
      </div>
      <p className="text-fg font-medium">{title}</p>
      {children && <div className="text-muted mt-1 max-w-sm text-sm">{children}</div>}
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
      className="border-danger/30 bg-danger-bg flex flex-col items-center rounded-lg border px-6 py-10 text-center"
    >
      <AlertTriangle className="text-danger mb-2 size-6" />
      <p className="text-danger font-medium">{title}</p>
      {children && <div className="text-fg/80 mt-1 max-w-md text-sm">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
