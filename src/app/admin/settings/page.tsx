import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { formatDateTime } from "@/lib/dates";
import { schoolSettingsView } from "@/lib/services/settings";
import { ActionForm } from "@/components/crm/action-form";
import { PageHeader } from "@/components/crm/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { saveSchoolProfileAction } from "./actions";

export const metadata = { title: "School settings" };

export default async function SchoolSettingsPage() {
  const user = await requireStaff("settings:read");
  const editable = can(user.role, "settings:write");
  const { profile: p, updatedAt, currentYear } = await schoolSettingsView(user);
  const ro = { readOnly: !editable };

  return (
    <>
      <PageHeader
        title="School profile"
        description={
          editable
            ? "How the school describes itself. Saved changes are audit-logged."
            : "How the school describes itself. Only a super admin can change it."
        }
      />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <ActionForm action={saveSchoolProfileAction} className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Identity</CardTitle>
            </CardHeader>
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field id="name" label="School name" required>
                <Input id="name" name="name" defaultValue={p.name} required maxLength={120} {...ro} />
              </Field>
              <Field id="shortName" label="Short name" required>
                <Input
                  id="shortName"
                  name="shortName"
                  defaultValue={p.shortName}
                  required
                  maxLength={60}
                  {...ro}
                />
              </Field>
              <Field id="tagline" label="Tagline" className="sm:col-span-2">
                <Input id="tagline" name="tagline" defaultValue={p.tagline} maxLength={200} {...ro} />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field id="phone" label="Phone" required>
                <Input id="phone" name="phone" type="tel" defaultValue={p.phone} required {...ro} />
              </Field>
              <Field
                id="whatsapp"
                label="WhatsApp number"
                required
                hint="Digits with country code, e.g. 910000000000"
              >
                <Input
                  id="whatsapp"
                  name="whatsapp"
                  inputMode="numeric"
                  defaultValue={p.whatsapp}
                  required
                  {...ro}
                />
              </Field>
              <Field id="email" label="General email" required>
                <Input id="email" name="email" type="email" defaultValue={p.email} required {...ro} />
              </Field>
              <Field id="admissionsEmail" label="Admissions email" required>
                <Input
                  id="admissionsEmail"
                  name="admissionsEmail"
                  type="email"
                  defaultValue={p.admissionsEmail}
                  required
                  {...ro}
                />
              </Field>
              <Field id="website" label="Website" required className="sm:col-span-2">
                <Input id="website" name="website" type="url" defaultValue={p.website} required {...ro} />
              </Field>
              <Field
                id="addressLines"
                label="Address"
                required
                hint="One line per row, up to six lines."
                className="sm:col-span-2"
              >
                <Textarea
                  id="addressLines"
                  name="addressLines"
                  rows={5}
                  defaultValue={p.addressLines.join("\n")}
                  required
                  {...ro}
                />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Social links and registration fee</CardTitle>
            </CardHeader>
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field id="instagram" label="Instagram link">
                <Input id="instagram" name="instagram" type="url" defaultValue={p.social.instagram} {...ro} />
              </Field>
              <Field id="linkedin" label="LinkedIn link">
                <Input id="linkedin" name="linkedin" type="url" defaultValue={p.social.linkedin} {...ro} />
              </Field>
              <Field id="youtube" label="YouTube link">
                <Input id="youtube" name="youtube" type="url" defaultValue={p.social.youtube} {...ro} />
              </Field>
              <Field
                id="registrationFee"
                label="Registration fee (₹)"
                required
                hint="Shown to families. The amount actually charged comes from the fee structure."
              >
                <Input
                  id="registrationFee"
                  name="registrationFee"
                  inputMode="decimal"
                  defaultValue={String(p.registrationFeePaise / 100)}
                  required
                  {...ro}
                />
              </Field>
            </CardBody>
          </Card>

          {editable && (
            <div className="flex items-center gap-3">
              <Button type="submit" className="h-11 px-6">
                Save school profile
              </Button>
              {updatedAt && <p className="text-sm text-muted">Last saved {formatDateTime(updatedAt)} IST</p>}
            </div>
          )}
        </ActionForm>

        <aside aria-label="Related settings" className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Academic year</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3 text-sm">
              <p>
                Current year: <strong className="font-semibold">{currentYear?.name ?? "none set"}</strong>
              </p>
              <p className="text-muted">The switch to a new year lives with the years and terms.</p>
              <Link
                href="/admin/academics/years"
                className="inline-flex min-h-11 items-center gap-1.5 font-medium text-primary underline underline-offset-4"
              >
                Years and terms <ArrowRight className="size-4" aria-hidden />
              </Link>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Fees</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3 text-sm">
              <p className="text-muted">Instalment plans, late fees, rebates and the refund policy.</p>
              <Link
                href="/admin/fees/rules"
                className="inline-flex min-h-11 items-center gap-1.5 font-medium text-primary underline underline-offset-4"
              >
                Plans and rules <ArrowRight className="size-4" aria-hidden />
              </Link>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="space-y-2 text-sm text-muted">
              <p>
                The public website still reads the built-in defaults. This profile is saved for the pages that
                will read it next.
              </p>
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
