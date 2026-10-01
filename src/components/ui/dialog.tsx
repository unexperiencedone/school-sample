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
      <D.Overlay className="bg-damson-950/45 fixed inset-0 z-50 backdrop-blur-[2px] data-[state=open]:animate-[page-enter_200ms_ease-out]" />
      <D.Content
        className={cn(
          "bg-elevated text-fg shadow-lift fixed z-50 flex flex-col focus:outline-none",
          isSheet
            ? "inset-y-0 right-0 h-dvh w-full max-w-md data-[state=open]:animate-[sheet-in_320ms_var(--ease-out)]"
            : "top-1/2 left-1/2 max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg data-[state=open]:animate-[page-enter_240ms_ease-out]",
          className,
        )}
        {...props}
      >
        <div className="border-line flex items-start justify-between gap-4 border-b px-6 py-5">
          <div>
            <D.Title className="text-primary font-serif text-2xl leading-tight">{title}</D.Title>
            {description ? (
              <D.Description className="text-muted mt-1 text-sm">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{String(title)}</D.Description>
            )}
          </div>
          <D.Close
            className="text-muted hover:bg-sunken hover:text-fg -mr-2 rounded-md p-2"
            aria-label="Close"
          >
            <X className="size-5" />
          </D.Close>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </D.Content>
      <style>{`@keyframes sheet-in{from{transform:translateX(100%)}to{transform:none}}`}</style>
    </D.Portal>
  );
}
