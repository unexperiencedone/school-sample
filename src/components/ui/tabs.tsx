"use client";

import { Tabs as T } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Tabs = T.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof T.List>) {
  return <T.List className={cn("bg-sunken inline-flex gap-1 rounded-lg p-1", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        "text-muted hover:text-fg data-[state=active]:bg-elevated data-[state=active]:text-primary data-[state=active]:shadow-soft rounded-md px-4 py-2 text-sm font-medium transition-colors",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof T.Content>) {
  return <T.Content className={cn("mt-6 focus-visible:outline-none", className)} {...props} />;
}
