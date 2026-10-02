import { Check, CircleCheck, CircleX, Clock, FlaskConical, PowerOff, RadioTower, X } from "lucide-react";
import type { IntegrationStatus } from "@/integrations/registry";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { formatDateTime } from "@/lib/dates";
import { cronOverview, integrationOverview, PHONE_TEST_KEYS } from "@/lib/services/settings-integrations";
import { formatDuration } from "@/lib/services/settings-rules";
import { PageHeader } from "@/components/crm/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { THead, Th, Tr, Td } from "@/components/ui/table";
import { ScrollRegion } from "../scroll-region";
import { RunNowControl, TestControl } from "./controls";

export const metadata = { title: "Integrations" };

const JOB_INFO: Record<string, { label: string; blurb: string }> = {
  "late-fees": {
    label: "Late fees",
    blurb: "Nightly: charges late fees and forfeits missed advance rebates.",
  },
  reminders: { label: "Reminders", blurb: "Daily: tour reminders and upcoming or overdue fee reminders." },
  "outbox-retry": { label: "Outbox retry", blurb: "Every 15 minutes: retries failed messages with backoff." },
};

function ModeBadge({ mode }: { mode: IntegrationStatus["mode"] }) {
  if (mode === "LIVE")
    return (
      <Badge tone="success">
        <RadioTower className="size-3.5" aria-hidden /> LIVE
      </Badge>
    );
  if (mode === "MOCK")
    return (
      <Badge tone="info">
        <FlaskConical className="size-3.5" aria-hidden /> MOCK
      </Badge>
    );
  return (
    <Badge tone="neutral">
      <PowerOff className="size-3.5" aria-hidden /> OFF
    </Badge>
  );
}

function RunBadge({ ok }: { ok: boolean | null }) {
  if (ok === null)
    return (
      <Badge tone="warning">
        <Clock className="size-3.5" aria-hidden /> Running
      </Badge>
    );
  return ok ? (
    <Badge tone="success">
      <CircleCheck className="size-3.5" aria-hidden /> OK
    </Badge>
  ) : (
    <Badge tone="danger">
      <CircleX className="size-3.5" aria-hidden /> Failed
    </Badge>
  );
}

export default async function IntegrationsPage() {
  const user = await requireStaff("settings:read");
  const canWrite = can(user.role, "settings:write");
  const integrations = integrationOverview(user);
  const jobs = await cronOverview(user);

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Which services are connected, whether they are real (LIVE) or simulated (MOCK), and a quick way to check each one. Only the names of environment variables are shown, never their values."
      />

      <Card className="mb-8 overflow-hidden">
        <ScrollRegion label="Integrations and their status">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Integrations and their status</caption>
            <THead>
              <tr>
                <Th>Adapter</Th>
                <Th>Selected by</Th>
                <Th>Provider</Th>
                <Th>Mode</Th>
                <Th>Environment variables</Th>
                <Th>Ready</Th>
                <Th>Test</Th>
              </tr>
            </THead>
            <tbody>
              {integrations.map((i) => (
                <Tr key={i.key} data-integration={i.key} className="align-top">
                  <Td className="font-medium whitespace-nowrap">{i.label}</Td>
                  <Td>
                    <code className="text-xs">{i.envVar}</code>
                  </Td>
                  <Td className="whitespace-nowrap">{i.provider}</Td>
                  <Td>
                    <ModeBadge mode={i.mode} />
                  </Td>
                  <Td>
                    {i.env.length ? (
                      <ul className="space-y-1">
                        {i.env.map((e) => (
                          <li key={e.name} className="flex items-center gap-1.5 text-xs">
                            {e.present ? (
                              <Check className="size-3.5 shrink-0 text-success" aria-hidden />
                            ) : (
                              <X className="size-3.5 shrink-0 text-danger" aria-hidden />
                            )}
                            <code>{e.name}</code>
                            <span className="text-muted">{e.present ? "set" : "missing"}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-xs text-muted">None needed</span>
                    )}
                  </Td>
                  <Td>
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      {i.ready ? (
                        <CircleCheck className="size-4 text-success" aria-hidden />
                      ) : (
                        <CircleX className="size-4 text-danger" aria-hidden />
                      )}
                      {i.ready ? "Yes" : "No"}
                    </span>
                  </Td>
                  <Td>
                    {!i.testable ? (
                      <span className="text-xs text-muted">
                        {i.mode === "OFF" ? "Switched off" : "No test available"}
                      </span>
                    ) : canWrite ? (
                      <TestControl
                        integrationKey={i.key}
                        label={i.label}
                        needsPhone={(PHONE_TEST_KEYS as readonly string[]).includes(i.key)}
                      />
                    ) : (
                      <span className="text-xs text-muted">Super admin only</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      </Card>

      <section aria-labelledby="jobs-heading">
        <h2 id="jobs-heading" className="mb-1 font-serif text-xl">
          Scheduled jobs
        </h2>
        <p className="mb-4 max-w-2xl text-sm text-muted">
          The last ten runs of each job. Running one by hand does exactly what the scheduler does, and the
          jobs are safe to repeat.
        </p>
        <div className="grid items-start gap-5 2xl:grid-cols-2">
          {jobs.map(({ job, runs }) => {
            const info = JOB_INFO[job] ?? { label: job, blurb: "" };
            return (
              <Card key={job} data-job={job} className="min-w-0">
                <CardHeader className="flex-wrap">
                  <div className="min-w-0">
                    <CardTitle>{info.label}</CardTitle>
                    <p className="mt-1 text-sm text-muted">{info.blurb}</p>
                  </div>
                  {canWrite && <RunNowControl job={job} label={info.label} />}
                </CardHeader>
                {runs.length ? (
                  <ScrollRegion label={`Recent runs of ${info.label}`}>
                    <table className="w-full border-collapse text-sm">
                      <caption className="sr-only">Recent runs of {info.label}</caption>
                      <THead>
                        <tr>
                          <Th>Started (IST)</Th>
                          <Th>Took</Th>
                          <Th>Result</Th>
                          <Th>Summary</Th>
                        </tr>
                      </THead>
                      <tbody>
                        {runs.map((r) => (
                          <Tr key={r.id} data-run>
                            <Td className="whitespace-nowrap">{formatDateTime(r.startedAt)}</Td>
                            <Td className="whitespace-nowrap tabular-nums">
                              {r.ms === null ? "—" : formatDuration(r.ms)}
                            </Td>
                            <Td>
                              <RunBadge ok={r.ok} />
                            </Td>
                            <Td className="max-w-64 min-w-40 text-xs break-words text-muted">{r.summary}</Td>
                          </Tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollRegion>
                ) : (
                  <CardBody>
                    <EmptyState title="No runs yet">The scheduler has not called this job.</EmptyState>
                  </CardBody>
                )}
              </Card>
            );
          })}
        </div>
      </section>
    </>
  );
}
