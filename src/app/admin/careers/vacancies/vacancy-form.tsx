"use client";

import { useState } from "react";
import { ActionForm } from "@/components/crm/action-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { EMPLOYMENT_SUGGESTIONS, VACANCY_STATUSES } from "@/lib/services/careers-admin-rules";
import { slugify } from "@/lib/utils";
import { createVacancyAction, updateVacancyAction } from "../actions";

export type VacancyFormValues = {
  title: string;
  slug: string;
  department: string;
  employment: string;
  location: string;
  summary: string;
  description: string;
  requirements: string[];
  closesAt: string;
  status: (typeof VACANCY_STATUSES)[number];
};

const STATUS_LABEL = { DRAFT: "Draft (not on the website)", OPEN: "Open", CLOSED: "Closed" } as const;

/** Create or edit a vacancy. The web address follows the title until someone edits it by hand. */
export function VacancyForm({
  id,
  initial,
  departments,
}: {
  id?: string;
  initial: VacancyFormValues;
  departments: string[];
}) {
  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [slugEdited, setSlugEdited] = useState(!!id);
  return (
    <ActionForm
      action={id ? updateVacancyAction.bind(null, id) : createVacancyAction}
      redirectTo={id ? undefined : "/admin/careers/vacancies"}
      className="space-y-5"
    >
      <div className="grid gap-5 md:grid-cols-2">
        <Field id="v-title" label="Title" required>
          <Input
            id="v-title"
            name="title"
            required
            maxLength={120}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (!slugEdited) setSlug(slugify(e.target.value).slice(0, 90));
            }}
          />
        </Field>
        <Field
          id="v-slug"
          label="Web address"
          required
          hint={`Shown as /careers/vacancies/${slug || "…"}. Changing it breaks links already shared.`}
        >
          <Input
            id="v-slug"
            name="slug"
            required
            maxLength={90}
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugEdited(true);
            }}
            aria-describedby="v-slug-hint"
          />
        </Field>
        <Field id="v-department" label="Department" required>
          <Input
            id="v-department"
            name="department"
            required
            maxLength={80}
            list="v-departments"
            defaultValue={initial.department}
          />
          <datalist id="v-departments">
            {departments.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </Field>
        <Field id="v-employment" label="Employment" required>
          <Input
            id="v-employment"
            name="employment"
            required
            maxLength={60}
            list="v-employments"
            defaultValue={initial.employment}
          />
          <datalist id="v-employments">
            {EMPLOYMENT_SUGGESTIONS.map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
        </Field>
        <Field id="v-location" label="Location" required>
          <Input id="v-location" name="location" required maxLength={120} defaultValue={initial.location} />
        </Field>
        <Field
          id="v-closes"
          label="Closing date"
          required
          hint="Candidates can apply until the end of this day (IST)."
        >
          <Input id="v-closes" name="closesAt" type="date" required defaultValue={initial.closesAt} />
        </Field>
      </div>
      <Field id="v-summary" label="Summary" required hint="One or two sentences shown in the vacancy list.">
        <Textarea
          id="v-summary"
          name="summary"
          rows={2}
          required
          maxLength={300}
          defaultValue={initial.summary}
        />
      </Field>
      <Field
        id="v-description"
        label="Description"
        required
        hint="Shown on the vacancy page. Blank lines start a new paragraph."
      >
        <Textarea
          id="v-description"
          name="description"
          rows={9}
          required
          defaultValue={initial.description}
        />
      </Field>
      <Field id="v-requirements" label="Requirements" required hint="One requirement per line.">
        <Textarea
          id="v-requirements"
          name="requirements"
          rows={6}
          required
          defaultValue={initial.requirements.join("\n")}
        />
      </Field>
      <Field id="v-status" label="Status" required className="max-w-xs">
        <Select id="v-status" name="status" defaultValue={initial.status}>
          {VACANCY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" className="h-11">
        {id ? "Save vacancy" : "Create vacancy"}
      </Button>
    </ActionForm>
  );
}
