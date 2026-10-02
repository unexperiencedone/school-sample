import { initials } from "@/lib/utils";
import type { PortalChild } from "@/lib/services/portal";

export function ChildHeader({ child, title }: { child: PortalChild; title: string }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="t-eyebrow">{title}</p>
        <h1 className="t-h1 mt-2 text-primary">
          {child.firstName} {child.lastName}
        </h1>
        <p className="mt-1 text-muted">
          {child.class.name}
          {child.section ? ` ${child.section.name}` : ""} ·{" "}
          {child.boardingType === "DAY"
            ? "Day pupil"
            : `${child.boardingType === "FULL" ? "Full" : "Flexi"} boarder`}
          {child.house ? ` · ${child.house.name} house` : ""} ·{" "}
          {child.status === "PROSPECTIVE" ? "joining soon" : child.admissionNo}
        </p>
      </div>
      <span
        aria-hidden
        className="grid size-14 place-items-center rounded-full bg-damson-100 font-serif text-xl text-damson-800"
      >
        {initials(`${child.firstName} ${child.lastName}`)}
      </span>
    </div>
  );
}

export function NoChildren() {
  return (
    <div className="rounded-lg border border-dashed border-line-strong p-8 text-center">
      <p className="font-medium">No pupils are linked to your account yet.</p>
      <p className="mt-1 text-sm text-muted">
        If your daughter has just been admitted, the school office will link her within a working day.
      </p>
    </div>
  );
}
