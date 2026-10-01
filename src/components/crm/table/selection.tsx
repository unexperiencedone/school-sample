"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type Ctx = {
  selected: Set<string>;
  toggle: (id: string) => void;
  setAll: (ids: string[], on: boolean) => void;
  clear: () => void;
  ids: string[];
};
const SelectionCtx = createContext<Ctx | null>(null);

export function useSelection() {
  const c = useContext(SelectionCtx);
  if (!c) throw new Error("useSelection outside SelectionProvider");
  return c;
}

/** Row selection for server-rendered tables. `ids` are the rows on the current page. */
export function SelectionProvider({ ids, children }: { ids: string[]; children: ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => setSelected(new Set()), [ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = useCallback(
    (id: string) =>
      setSelected((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      }),
    [],
  );
  const setAll = useCallback(
    (list: string[], on: boolean) => setSelected(on ? new Set(list) : new Set()),
    [],
  );
  const clear = useCallback(() => setSelected(new Set()), []);
  const value = useMemo(
    () => ({ selected, toggle, setAll, clear, ids }),
    [selected, toggle, setAll, clear, ids],
  );
  return <SelectionCtx.Provider value={value}>{children}</SelectionCtx.Provider>;
}

export function RowCheckbox({ id, label }: { id: string; label: string }) {
  const { selected, toggle } = useSelection();
  return (
    <input
      type="checkbox"
      className="size-4 accent-[var(--primary)]"
      checked={selected.has(id)}
      onChange={() => toggle(id)}
      aria-label={`Select ${label}`}
      data-row-select={id}
    />
  );
}

export function SelectAllCheckbox() {
  const { selected, setAll, ids } = useSelection();
  const all = ids.length > 0 && ids.every((id) => selected.has(id));
  return (
    <input
      type="checkbox"
      className="size-4 accent-[var(--primary)]"
      checked={all}
      ref={(el) => {
        if (el) el.indeterminate = !all && selected.size > 0;
      }}
      onChange={() => setAll(ids, !all)}
      aria-label="Select all rows on this page"
    />
  );
}

/** Sticky bar shown while rows are selected; children receive the selected ids. */
export function BulkBar({ children }: { children: (ids: string[], clear: () => void) => ReactNode }) {
  const { selected, clear } = useSelection();
  if (selected.size === 0) return null;
  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="sticky bottom-4 z-20 mx-auto mt-4 flex w-fit flex-wrap items-center gap-3 rounded-full border border-line bg-elevated px-4 py-2 shadow-lift"
    >
      <span className="text-sm font-medium">{selected.size} selected</span>
      {children([...selected], clear)}
      <button type="button" onClick={clear} className="text-sm text-muted underline">
        Clear
      </button>
    </div>
  );
}
