import { Check, CircleCheck, CircleSlash, TriangleAlert, UserPlus } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/rbac";
import { formatDateTime } from "@/lib/dates";
import { roleMatrix } from "@/lib/services/settings-rules";
import { listStaffUsers } from "@/lib/services/users-admin";
import { ActionForm } from "@/components/crm/action-form";
import { PageHeader } from "@/components/crm/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { THead, Th, Tr, Td } from "@/components/ui/table";
import { ScrollRegion } from "../scroll-region";
import { changeRoleAction, inviteUserAction, setActiveAction } from "../actions";

export const metadata = { title: "Users and roles" };

export default async function UsersPage() {
  const me = await requireStaff("users:manage");
  const users = await listStaffUsers(me);
  const matrix = roleMatrix();
  const activeSuperAdmins = users.filter((u) => u.role === "SUPER_ADMIN" && u.active).length;

  return (
    <>
      <PageHeader
        title="Users and roles"
        description="Staff accounts and what each role may do. Parent and applicant accounts are not listed here. Every change needs a reason and is audit-logged."
      />

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Invite a staff member</CardTitle>
        </CardHeader>
        <CardBody>
          <ActionForm
            action={inviteUserAction}
            resetOnSuccess
            className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_12rem_auto]"
          >
            <Field id="invite-name" label="Full name" required>
              <Input id="invite-name" name="name" required minLength={2} maxLength={100} autoComplete="off" />
            </Field>
            <Field
              id="invite-email"
              label="Email address"
              required
              hint="They sign in with a link sent here."
            >
              <Input id="invite-email" name="email" type="email" required autoComplete="off" />
            </Field>
            <Field id="invite-role" label="Role" required>
              <Select id="invite-role" name="role" defaultValue="TEACHER" required>
                {matrix.roles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" className="h-11 px-5">
              <UserPlus aria-hidden /> Send invite
            </Button>
          </ActionForm>
        </CardBody>
      </Card>

      <section aria-labelledby="staff-heading" className="mb-8">
        <h2 id="staff-heading" className="mb-3 font-serif text-xl">
          Staff accounts
        </h2>
        <Card className="overflow-hidden">
          <ScrollRegion label="Staff accounts">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Staff accounts, roles and access</caption>
              <THead>
                <tr>
                  <Th>Name</Th>
                  <Th>Role</Th>
                  <Th>Access</Th>
                  <Th>Last sign-in (IST)</Th>
                  <Th>Manage</Th>
                </tr>
              </THead>
              <tbody>
                {users.map((u) => {
                  const isMe = u.id === me.id;
                  const lastSuper = u.role === "SUPER_ADMIN" && u.active && activeSuperAdmins === 1;
                  return (
                    <Tr key={u.id} data-user-email={u.email} className="align-top">
                      <Td>
                        <span className="block font-medium">
                          {u.name ?? u.email}
                          {isMe && <span className="font-normal text-muted"> (you)</span>}
                        </span>
                        <span className="block text-xs text-muted">{u.email}</span>
                      </Td>
                      <Td className="whitespace-nowrap" data-role>
                        {ROLE_LABELS[u.role]}
                      </Td>
                      <Td>
                        {u.active ? (
                          <Badge tone="success">
                            <CircleCheck className="size-3.5" aria-hidden /> Active
                          </Badge>
                        ) : (
                          <Badge tone="neutral">
                            <CircleSlash className="size-3.5" aria-hidden /> Off
                          </Badge>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap">
                        {u.lastLoginAt ? (
                          formatDateTime(u.lastLoginAt)
                        ) : (
                          <span className="text-muted">Never</span>
                        )}
                      </Td>
                      <Td className="min-w-64">
                        {isMe ? (
                          <span className="text-xs text-muted">You can&apos;t change your own account.</span>
                        ) : lastSuper ? (
                          <span className="text-xs text-muted">The only active super admin.</span>
                        ) : (
                          <div className="space-y-2">
                            <details className="group rounded-md border border-line">
                              <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 font-medium focus-visible:outline-3 focus-visible:outline-focus">
                                Change role
                              </summary>
                              <ActionForm
                                action={changeRoleAction.bind(null, u.id)}
                                className="space-y-3 border-t border-line p-3"
                              >
                                <Field id={`role-${u.id}`} label="New role" required>
                                  <Select id={`role-${u.id}`} name="role" defaultValue={u.role} required>
                                    {matrix.roles.map((r) => (
                                      <option key={r} value={r}>
                                        {ROLE_LABELS[r]}
                                      </option>
                                    ))}
                                  </Select>
                                </Field>
                                <Field id={`role-reason-${u.id}`} label="Reason" required>
                                  <Input
                                    id={`role-reason-${u.id}`}
                                    name="reason"
                                    required
                                    minLength={5}
                                    maxLength={500}
                                    autoComplete="off"
                                  />
                                </Field>
                                <Button type="submit" className="h-11 w-full">
                                  Change role
                                </Button>
                              </ActionForm>
                            </details>
                            <details className="group rounded-md border border-line">
                              <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 font-medium focus-visible:outline-3 focus-visible:outline-focus">
                                {u.active ? "Switch off access" : "Restore access"}
                              </summary>
                              <ActionForm
                                action={setActiveAction.bind(null, u.id, !u.active)}
                                className="space-y-3 border-t border-line p-3"
                              >
                                <Field id={`active-reason-${u.id}`} label="Reason" required>
                                  <Input
                                    id={`active-reason-${u.id}`}
                                    name="reason"
                                    required
                                    minLength={5}
                                    maxLength={500}
                                    autoComplete="off"
                                  />
                                </Field>
                                <Button
                                  type="submit"
                                  variant={u.active ? "danger" : "primary"}
                                  className="h-11 w-full"
                                >
                                  {u.active ? "Switch off access" : "Restore access"}
                                </Button>
                              </ActionForm>
                            </details>
                          </div>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollRegion>
        </Card>
      </section>

      <section aria-labelledby="matrix-heading">
        <h2 id="matrix-heading" className="mb-1 font-serif text-xl">
          What each role can do
        </h2>
        <p className="mb-3 max-w-2xl text-sm text-muted">
          Read-only, generated from the permission table in the code. Permissions marked{" "}
          <span className="inline-flex items-center gap-1 font-medium text-fg">
            <TriangleAlert className="size-3.5" aria-hidden /> sensitive
          </span>{" "}
          always need a reason and are audit-logged.
        </p>
        <Card className="overflow-hidden">
          <ScrollRegion label="What each role can do">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Permissions by staff role</caption>
              <THead>
                <tr>
                  <Th>Permission</Th>
                  {matrix.roles.map((r) => (
                    <Th key={r} className="text-center">
                      {ROLE_LABELS[r]}
                    </Th>
                  ))}
                </tr>
              </THead>
              {matrix.modules.map((m) => (
                <tbody key={m.module}>
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={matrix.roles.length + 1}
                      className="border-b border-line bg-sunken px-3 py-2 text-left text-xs font-semibold tracking-wide text-fg uppercase"
                    >
                      {m.module}
                    </th>
                  </tr>
                  {m.rows.map((row) => (
                    <Tr key={row.permission}>
                      <th scope="row" className="px-3 py-2 text-left font-normal whitespace-nowrap">
                        <code className="text-xs">{row.permission}</code>
                        {row.sensitive && (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted">
                            <TriangleAlert className="size-3.5" aria-hidden /> sensitive
                          </span>
                        )}
                      </th>
                      {matrix.roles.map((r) => (
                        <Td key={r} className="text-center">
                          {row.roles[r] ? (
                            <>
                              <Check className="mx-auto size-4 text-success" aria-hidden />
                              <span className="sr-only">Yes</span>
                            </>
                          ) : (
                            <>
                              <span aria-hidden className="text-muted">
                                –
                              </span>
                              <span className="sr-only">No</span>
                            </>
                          )}
                        </Td>
                      ))}
                    </Tr>
                  ))}
                </tbody>
              ))}
            </table>
          </ScrollRegion>
        </Card>
      </section>
    </>
  );
}
