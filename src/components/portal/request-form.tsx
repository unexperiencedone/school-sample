"use client";

import { useState } from "react";
import { ActionForm } from "@/components/crm/action-form";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { sendRequestAction } from "@/app/portal/actions";

/** One form, three kinds of request; fields change with the kind. */
export function RequestForm({ studentId, childName }: { studentId: string; childName: string }) {
  const [kind, setKind] = useState("PROFILE_UPDATE");
  return (
    <ActionForm action={sendRequestAction} resetOnSuccess className="space-y-4">
      <input type="hidden" name="studentId" value={studentId} />
      <label className="block text-sm">
        <span className="mb-1 block font-medium">What would you like to do?</span>
        <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="PROFILE_UPDATE">Update our contact details</option>
          <option value="CONCESSION">Ask about a scholarship or bursary</option>
          <option value="WITHDRAWAL">Give notice of withdrawal</option>
        </Select>
      </label>
      {kind === "PROFILE_UPDATE" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">New mobile number</span>
            <Input name="phone" inputMode="tel" autoComplete="tel" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">New email</span>
            <Input name="email" type="email" autoComplete="email" />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">New address</span>
            <Textarea name="address" rows={2} autoComplete="street-address" />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Anything else</span>
            <Input name="note" />
          </label>
        </div>
      )}
      {kind === "CONCESSION" && (
        <>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Type</span>
            <Select name="concessionKind">
              <option>Bursary (means-tested)</option>
              <option>Academic scholarship</option>
              <option>Music, art or sport scholarship</option>
            </Select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              Tell us a little about your circumstances or {childName}&apos;s achievements
            </span>
            <Textarea name="reason" rows={4} required minLength={10} />
          </label>
          <p className="text-xs text-muted">
            Requests are confidential and seen only by the Principal and Accounts.
          </p>
        </>
      )}
      {kind === "WITHDRAWAL" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Last day at school</span>
              <Input type="date" name="lastDay" required />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Moving to (optional)</span>
              <Input name="destination" />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Reason</span>
            <Textarea name="reason" rows={3} required minLength={5} />
          </label>
          <p className="text-xs text-muted">
            The fee policy asks for 90 days&apos; written notice; this request counts as written notice from
            today.
          </p>
        </>
      )}
      <Button type="submit">Send to the school</Button>
    </ActionForm>
  );
}
