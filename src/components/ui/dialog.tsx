"use client";

import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  side,
  ...props
}: ComponentProps<typeof D.Content> & {
  title: ReactNode;
  description?: ReactNode;
  side?: "right" | "center";
}) {
  const isSheet = side === "right";
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-damson-950/45 backdrop-blur-[2px] data-[state=open]:animate-[page-enter_200ms_ease-out]" />
      <D.Content
        className={cn(
          "fixed z-50 flex flex-col bg-elevated text-fg shadow-lift focus:outline-none",
          isSheet
            ? "inset-y-0 right-0 h-dvh w-full max-w-md data-[state=open]:animate-[sheet-in_320ms_var(--ease-out)]"
            : "top-1/2 left-1/2 max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg data-[state=open]:animate-[page-enter_240ms_ease-out]",
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div>
            <D.Title className="font-serif text-2xl leading-tight text-primary">{title}</D.Title>
            {description ? (
              <D.Description className="mt-1 text-sm text-muted">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{String(title)}</D.Description>
            )}
          </div>
          <D.Close
            className="-mr-2 rounded-md p-2 text-muted hover:bg-sunken hover:text-fg"
            aria-label="Close"
          >
            <X className="size-5" />
          </D.Close>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </D.Content>
    </D.Portal>
  );
}
