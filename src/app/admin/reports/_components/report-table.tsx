import { AlertTriangle } from "lucide-react";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";
import { formatCell, type ReportTable } from "@/lib/reports/table";
import { cn } from "@/lib/utils";

/** Shown in place of a chart or table when the period has no data. */
export function NoData() {
  return <p className="py-6 text-sm text-muted">Nothing to show for this period.</p>;
}

/**
 * The accessible twin of every chart and the only view of detail tables: the same typed table the exports are
 * built from, right-aligned and tabular for numbers, with the totals row set apart.
 * `flag` marks cells that need attention; they get an icon as well as colour.
 */
export function ReportTableView({
  table,
  flag,
}: {
  table: ReportTable;
  flag?: (columnKey: string, cell: string | number | null) => boolean;
}) {
  if (table.rows.length === 0) return <NoData />;
  return (
    <Table scrollLabel={table.title}>
      <caption className="sr-only">{table.title}</caption>
      <THead>
        <tr>
          {table.columns.map((c) => (
            <Th key={c.key} className={c.kind === "text" ? undefined : "text-right"}>
              {c.label}
            </Th>
          ))}
        </tr>
      </THead>
      <tbody>
        {table.rows.map((row, r) => (
          <Tr key={r}>
            {table.columns.map((c, i) => {
              const cell = row[i] ?? null;
              const flagged = flag?.(c.key, cell) ?? false;
              return (
                <Td
                  key={c.key}
                  className={cn(
                    i === 0 && "font-medium",
                    c.kind !== "text" && "text-right tabular-nums",
                    flagged && "font-semibold text-danger",
                  )}
                >
                  {flagged ? (
                    <span className="inline-flex items-center justify-end gap-1">
                      <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                      {formatCell(c, cell)}
                    </span>
                  ) : (
                    formatCell(c, cell)
                  )}
                </Td>
              );
            })}
          </Tr>
        ))}
        {table.totals && (
          <tr className="border-t-2 border-line-strong bg-sunken/50 font-semibold">
            {table.columns.map((c, i) => (
              <Td key={c.key} className={cn(c.kind !== "text" && "text-right tabular-nums")}>
                {formatCell(c, table.totals![i] ?? null)}
              </Td>
            ))}
          </tr>
        )}
      </tbody>
    </Table>
  );
}
