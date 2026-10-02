"use client";

import { ActionForm } from "@/components/crm/action-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select, Textarea } from "@/components/ui/input";
import { resolveRequestAction } from "../../actions";

/** Close an open request as done or rejected. Notes are required and go into the audit log as the reason. */
export function ResolveForm({ id }: { id: string }) {
  return (
    <ActionForm action={resolveRequestAction.bind(null, id)} className="space-y-4">
      <Field id="resolve-status" label="Outcome" required>
        <Select id="resolve-status" name="status" defaultValue="DONE" required>
          <option value="DONE">Done: the request was carried out</option>
          <option value="REJECTED">Rejected: it could not be carried out</option>
        </Select>
      </Field>
      <Field
        id="resolve-notes"
        label="Notes"
        required
        hint="What was done, or why not. This goes into the audit log."
      >
        <Textarea id="resolve-notes" name="notes" rows={4} required minLength={5} maxLength={500} />
      </Field>
      <Button type="submit" className="h-11">
        Save outcome
      </Button>
    </ActionForm>
  );
}
