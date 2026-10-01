"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { formatINR, paiseToRupeeString, toPaise } from "@/lib/money";
import { discardAction, publishAction, saveDraftAction } from "../../actions";

type Head = {
  id: string;
  code: string;
  name: string;
  oneTime: boolean;
  amountPaise: number;
  currentPaise: number;
};

/** Edit a structure's amounts into a draft revision. "Apply %" adjusts recurring heads, rounded to whole rupees. */
export function RevisionEditor({
  activeId,
  heads,
  defaultReason,
  defaultEffectiveFrom,
}: {
  activeId: string;
  heads: Head[];
  defaultReason: string;
  defaultEffectiveFrom: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [values, setValues] = useState(() =>
    Object.fromEntries(heads.map((h) => [h.id, paiseToRupeeString(h.amountPaise).replace(/\.00$/, "")])),
  );
  const [pct, setPct] = useState("");
  const parse = (v: string) => {
    try {
      return toPaise(v.replace(/,/g, "") || "0");
    } catch {
      return null;
    }
  };
  const total = heads.reduce((a, h) => a + (h.oneTime ? 0 : (parse(values[h.id] ?? "") ?? 0)), 0);
  const was = heads.reduce((a, h) => a + (h.oneTime ? 0 : h.currentPaise), 0);
  const applyPct = () => {
    const p = Number(pct);
    if (!Number.isFinite(p) || p < -50 || p > 50) return toast.error("Enter a percentage between -50 and 50");
    setValues((v) => {
      const next = { ...v };
      for (const h of heads)
        if (!h.oneTime) next[h.id] = String(Math.round((h.currentPaise * (1 + p / 100)) / 100));
      return next;
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await saveDraftAction(activeId, fd);
          if (!r.ok) return void toast.error(r.error);
          toast.success(r.message);
          router.push(`/admin/fees/structures/${r.id}`);
        });
      }}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-end gap-2 rounded-md bg-sunken p-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Change all recurring heads by</span>
          <span className="flex items-center gap-1">
            <Input
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              inputMode="decimal"
              className="h-9 w-20"
              aria-label="Percentage change"
            />
            <span className="text-sm text-muted">%</span>
          </span>
        </label>
        <Button type="button" variant="outline" size="sm" onClick={applyPct}>
          Apply
        </Button>
        <p className="ml-auto text-sm">
          Annual fees <span className="font-semibold tabular-nums">{formatINR(total)}</span>{" "}
          <span className={total === was ? "text-muted" : total > was ? "text-danger" : "text-success"}>
            ({formatINR(total - was, { sign: true })})
          </span>
        </p>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted">
          <tr>
            <th className="py-2 font-medium">Fee head</th>
            <th className="py-2 text-right font-medium">Live amount</th>
            <th className="w-44 py-2 text-right font-medium">Revised (₹)</th>
          </tr>
        </thead>
        <tbody>
          {heads.map((h) => {
            const v = parse(values[h.id] ?? "");
            const changed = v !== null && v !== h.currentPaise;
            return (
              <tr key={h.id} className="border-t border-line">
                <td className="py-2">
                  <label htmlFor={`head-${h.id}`}>{h.name}</label>
                  {h.oneTime && <span className="ml-2 text-xs text-muted">one-time</span>}
                </td>
                <td className="py-2 text-right text-muted tabular-nums">{formatINR(h.currentPaise)}</td>
                <td className="py-2 text-right">
                  <Input
                    id={`head-${h.id}`}
                    name={`head:${h.id}`}
                    value={values[h.id] ?? ""}
                    onChange={(e) => setValues((x) => ({ ...x, [h.id]: e.target.value }))}
                    inputMode="decimal"
                    aria-invalid={v === null || undefined}
                    className={`h-9 text-right tabular-nums ${changed ? "border-accent font-semibold" : ""}`}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Reason (recorded in the audit log)</span>
          <Textarea name="reason" defaultValue={defaultReason} rows={2} required minLength={5} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Effective from</span>
          <Input type="date" name="effectiveFrom" defaultValue={defaultEffectiveFrom} required />
        </label>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save draft and preview impact"}
      </Button>
    </form>
  );
}

export function PublishPanel({ draftId, openInvoices }: { draftId: string; openInvoices: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reprice, setReprice] = useState(true);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await publishAction(draftId, fd);
          if (!r.ok) return void toast.error(r.error);
          toast.success(r.message);
          router.push("/admin/fees");
        });
      }}
      className="space-y-3"
    >
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="reprice"
          checked={reprice}
          onChange={(e) => setReprice(e.target.checked)}
          className="mt-0.5 size-4 accent-[var(--primary)]"
        />
        <span>
          Reprice the {openInvoices} open {openInvoices === 1 ? "invoice" : "invoices"} on the live version
          and email families their revised invoice
          <span className="block text-xs text-muted">
            Settled instalments are never re-opened; overpaid principal becomes a credit on account. Leave
            unticked to apply the new fees to new invoices only.
          </span>
        </span>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Approval note</span>
        <Textarea
          name="reason"
          rows={2}
          required
          minLength={5}
          placeholder="e.g. Approved by the Board on 28 Sep (minute 14)"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Publishing…" : "Publish revision"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              if (!window.confirm("Discard this draft? Nothing has been published.")) return;
              const r = await discardAction(draftId);
              if (!r.ok) return void toast.error(r.error);
              toast.success("Draft discarded");
              router.push("/admin/fees");
            })
          }
        >
          Discard draft
        </Button>
      </div>
    </form>
  );
}
