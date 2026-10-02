import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { formatDate } from "@/lib/dates";
import { parseListParams } from "@/lib/crm/list";
import { qs } from "@/lib/crm/qs";
import {
  APPLICATION_SORTS,
  applicationFacets,
  BOARD_PER_COLUMN,
  draftCount,
  listApplications,
  pipelineBoard,
  stageCounts,
} from "@/lib/services/careers-admin";
import { BOARD_STAGES, displayName, isBoardStage, STAGE_LABEL } from "@/lib/services/careers-admin-rules";
import { PageHeader } from "@/components/crm/page-header";
import { FilterBar } from "@/components/crm/table/filter-bar";
import { Pager } from "@/components/crm/table/pager";
import { SortTh } from "@/components/crm/table/sort-header";
import { TableKeys } from "@/components/crm/table/table-keys";
import { EmptyState } from "@/components/ui/states";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ApplicationStatusBadge, FlagBadge, ScoreText } from "./badges";
import { ApplicationBoard, type BoardCard } from "./board";

export const metadata = { title: "Staff applications" };

type SearchParams = Record<string, string | undefined>;

const viewLink = "inline-flex h-11 items-center rounded-md px-4 text-sm font-medium";

export default async function CareersPipelinePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireStaff("careers:read");
  const sp = await searchParams;
  const view = sp.view === "table" ? "table" : "board";
  const filters = { q: sp.q, vacancyId: sp.vacancy };
  const vacancies = await applicationFacets(user);
  const canWrite = can(user.role, "careers:write");

  const fields = [
    {
      type: "search" as const,
      name: "q",
      label: "Search applications",
      placeholder: "Name, email, reference or vacancy…",
    },
    {
      type: "select" as const,
      name: "vacancy",
      label: "Vacancy",
      options: vacancies.map((v) => ({ value: v.id, label: v.title })),
    },
    ...(view === "table"
      ? [
          {
            type: "select" as const,
            name: "status",
            label: "Stage",
            options: BOARD_STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] })),
          },
        ]
      : []),
  ];

  const toggle = (
    <nav aria-label="Pipeline view" className="inline-flex gap-1 rounded-lg bg-sunken p-1">
      {(["board", "table"] as const).map((v) => (
        <Link
          key={v}
          href={qs(sp, { view: v === "board" ? null : v, status: null, sort: null, dir: null })}
          aria-current={view === v ? "page" : undefined}
          className={cn(
            viewLink,
            view === v ? "bg-elevated text-primary shadow-soft" : "text-muted hover:text-fg",
          )}
        >
          {v === "board" ? "Board" : "Table"}
        </Link>
      ))}
    </nav>
  );

  if (view === "board") {
    const board = await pipelineBoard(user, filters);
    const cards: BoardCard[] = board.columns.flatMap((c) =>
      c.cards.map((a) => ({
        id: a.id,
        ref: a.ref,
        name: displayName(a),
        vacancy: a.vacancy?.title ?? null,
        score: a.score,
        submitted: a.submittedAt ? formatDate(a.submittedAt, "d MMM") : "",
        flagged: a.flagged,
        status: c.stage,
      })),
    );
    return (
      <>
        <PageHeader
          title="Staff applications"
          description={`${board.total} submitted application${board.total === 1 ? "" : "s"}. Move people through the stages as the process goes on.`}
          actions={toggle}
        />
        <FilterBar className="mb-4" fields={fields} />
        {board.drafts > 0 && <DraftNote count={board.drafts} />}
        <ApplicationBoard
          columns={board.columns.map((c) => ({
            stage: c.stage,
            count: c.count,
            shown: Math.min(c.count, BOARD_PER_COLUMN),
          }))}
          cards={cards}
          canWrite={canWrite}
        />
      </>
    );
  }

  const p = parseListParams(sp, { sorts: APPLICATION_SORTS, defaultSort: "submittedAt", take: 25 });
  const [counts, drafts, { rows, next, prev, total }] = await Promise.all([
    stageCounts(user, filters),
    draftCount(user, sp.vacancy),
    listApplications(user, { ...filters, status: sp.status }, p),
  ]);
  const all = BOARD_STAGES.reduce((n, s) => n + counts[s], 0);
  const active = isBoardStage(sp.status) ? sp.status : null;
  const chip = "inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm";
  return (
    <>
      <PageHeader
        title="Staff applications"
        description={`${all} submitted application${all === 1 ? "" : "s"}.`}
        actions={toggle}
      />
      <nav aria-label="Applications by stage" className="mb-4">
        <ul className="flex flex-wrap gap-2">
          {[
            { stage: null, label: "All", count: all },
            ...BOARD_STAGES.map((s) => ({ stage: s, label: STAGE_LABEL[s], count: counts[s] })),
          ].map((c) => (
            <li key={c.label}>
              <Link
                href={qs(sp, { status: c.stage })}
                aria-current={active === c.stage ? "true" : undefined}
                className={cn(
                  chip,
                  active === c.stage
                    ? "border-primary bg-sunken font-semibold text-fg"
                    : "border-line text-muted hover:bg-sunken hover:text-fg",
                )}
              >
                {c.label} <span className="tabular-nums">{c.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <FilterBar className="mb-4" fields={fields} />
      {drafts > 0 && <DraftNote count={drafts} />}
      <TableKeys />
      <div className="overflow-hidden rounded-lg border border-line bg-elevated">
        {rows.length ? (
          <Table>
            <THead>
              <tr>
                <SortTh sp={sp} field="fullName" label="Applicant" current={p.sort} dir={p.dir} />
                <Th>Vacancy</Th>
                <SortTh sp={sp} field="status" label="Stage" current={p.sort} dir={p.dir} />
                <SortTh sp={sp} field="score" label="Score" current={p.sort} dir={p.dir} />
                <SortTh sp={sp} field="submittedAt" label="Submitted" current={p.sort} dir={p.dir} />
              </tr>
            </THead>
            <tbody>
              {rows.map((a) => (
                <Tr key={a.id} data-row>
                  <Td>
                    <Link
                      data-row-link
                      href={`/admin/careers/${a.id}`}
                      className="font-medium hover:underline"
                    >
                      {displayName(a)}
                    </Link>
                    <span className="block text-xs text-muted">{a.ref}</span>
                    {a.flagged && (
                      <span className="mt-1 block">
                        <FlagBadge />
                      </span>
                    )}
                  </Td>
                  <Td className="text-sm">{a.vacancy?.title ?? "General application"}</Td>
                  <Td>
                    <ApplicationStatusBadge status={a.status} />
                  </Td>
                  <Td>
                    <ScoreText score={a.score} />
                  </Td>
                  <Td className="whitespace-nowrap text-muted">
                    {a.submittedAt ? formatDate(a.submittedAt) : "—"}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="p-6">
            <EmptyState title="No applications match">Try clearing the filters.</EmptyState>
          </div>
        )}
        <Pager sp={sp} next={next} prev={prev} total={total} shown={rows.length} />
      </div>
    </>
  );
}

function DraftNote({ count }: { count: number }) {
  return (
    <p className="mb-4 text-sm text-muted">
      {count} draft{count === 1 ? "" : "s"} in progress. Candidates are still writing{" "}
      {count === 1 ? "it" : "them"}, so {count === 1 ? "it isn't" : "they aren't"} in the pipeline yet.
    </p>
  );
}
