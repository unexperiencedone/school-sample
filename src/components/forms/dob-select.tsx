"use client";

import type { FieldValues, Path, UseFormRegister } from "react-hook-form";
import { Select } from "@/components/ui/input";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Day / month / year selects with an age-appropriate year range (children aged 2–18). */
export function DobSelect<T extends FieldValues>({
  register,
  idPrefix,
  error,
}: {
  register: UseFormRegister<T>;
  idPrefix: string;
  error?: string;
}) {
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 17 }, (_, i) => thisYear - 2 - i);
  return (
    <fieldset aria-describedby={error ? `${idPrefix}-dob-error` : undefined}>
      <legend className="mb-1.5 text-sm font-medium text-fg">Child&apos;s date of birth</legend>
      <div className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-2">
        <Select
          id={`${idPrefix}-dobDay`}
          aria-label="Day"
          aria-invalid={!!error}
          {...register("dobDay" as Path<T>)}
        >
          <option value="">DD</option>
          {Array.from({ length: 31 }, (_, i) => (
            <option key={i} value={String(i + 1)}>
              {String(i + 1).padStart(2, "0")}
            </option>
          ))}
        </Select>
        <Select
          id={`${idPrefix}-dobMonth`}
          aria-label="Month"
          aria-invalid={!!error}
          {...register("dobMonth" as Path<T>)}
        >
          <option value="">Month</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={String(i + 1)}>
              {m}
            </option>
          ))}
        </Select>
        <Select
          id={`${idPrefix}-dobYear`}
          aria-label="Year"
          aria-invalid={!!error}
          {...register("dobYear" as Path<T>)}
        >
          <option value="">YYYY</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </Select>
      </div>
      {error && (
        <p id={`${idPrefix}-dob-error`} role="alert" className="mt-1.5 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
