import type { LabelHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Label({
  className,
  children,
  required,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label className={cn("text-fg mb-1.5 block text-sm font-medium", className)} {...props}>
      {children}
      {required && (
        <span className="text-kiln-700 ml-0.5" aria-hidden="true">
          *
        </span>
      )}
    </label>
  );
}
