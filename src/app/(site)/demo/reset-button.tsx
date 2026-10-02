"use client";

import { resetDemo } from "./actions";

/** One click wipes everything entered during a demo, so it asks first. */
export function ResetButton({ className }: { className: string }) {
  return (
    <form
      action={resetDemo}
      onSubmit={(e) => {
        if (
          !window.confirm("Reset the sample school? Everything entered since it was shipped will be removed.")
        )
          e.preventDefault();
      }}
    >
      <button type="submit" className={className}>
        Reset the sample school
      </button>
    </form>
  );
}
