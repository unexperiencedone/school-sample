"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { updateStaffAction } from "../actions";

/** Designation, department and phone: the details HR keeps up to date. Names and email identify the person. */
export function StaffEditButton({
  id,
  name,
  designation,
  department,
  phone,
}: {
  id: string;
  name: string;
  designation: string;
  department: string;
  phone: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Edit ${name}`}>
          <Pencil aria-hidden /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent title={`Edit ${name}`} description="Changes are recorded in the audit log.">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              const r = await updateStaffAction(id, fd);
              if (!r.ok) return void toast.error(r.error);
              toast.success(r.message ?? "Saved");
              setOpen(false);
            });
          }}
        >
          <Field id={`designation-${id}`} label="Designation" required>
            <Input
              id={`designation-${id}`}
              name="designation"
              defaultValue={designation}
              required
              maxLength={100}
            />
          </Field>
          <Field id={`department-${id}`} label="Department" required>
            <Input
              id={`department-${id}`}
              name="department"
              defaultValue={department}
              required
              maxLength={80}
            />
          </Field>
          <Field id={`phone-${id}`} label="Phone">
            <Input id={`phone-${id}`} name="phone" type="tel" defaultValue={phone} maxLength={20} />
          </Field>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
