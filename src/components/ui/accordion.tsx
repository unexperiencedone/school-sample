"use client";

import { Accordion as A } from "radix-ui";
import { Plus } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Accordion = A.Root;

export function AccordionItem({
  title,
  children,
  className,
  ...props
}: Omit<ComponentProps<typeof A.Item>, "title"> & { title: ReactNode; children: ReactNode }) {
  return (
    <A.Item className={cn("border-line border-b", className)} {...props}>
      <A.Header>
        <A.Trigger className="group text-fg hover:text-primary flex w-full items-center justify-between gap-6 py-5 text-left font-serif text-xl">
          {title}
          <Plus
            className="text-kiln-700 size-5 shrink-0 transition-transform duration-300 group-data-[state=open]:rotate-45"
            aria-hidden
          />
        </A.Trigger>
      </A.Header>
      <A.Content className="overflow-hidden data-[state=closed]:animate-[acc-up_220ms_ease-out] data-[state=open]:animate-[acc-down_260ms_ease-out]">
        <div className="text-muted pb-6 text-[0.98rem] leading-relaxed">{children}</div>
      </A.Content>
      <style>{`@keyframes acc-down{from{height:0}to{height:var(--radix-accordion-content-height)}}@keyframes acc-up{from{height:var(--radix-accordion-content-height)}to{height:0}}`}</style>
    </A.Item>
  );
}
