import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, parseJson, route } from "@/lib/api";
import { assertApplicationAccess } from "@/lib/registration-access";
import { registrationFeeFor } from "@/lib/services/admissions";
import { createPaymentOrder } from "@/lib/services/payments";
import { declarationStep, parentsStep } from "@/lib/schemas/registration";

/** POST /api/registration/[id]/pay — validates the draft is complete and creates the registration-fee order. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const app = await assertApplicationAccess(req, params.id);
  await parseJson(req, declarationStep.extend({ attempt: z.number().int().min(0).max(20).optional() }));
  if (app.stage !== "DRAFT")
    throw new ApiError(409, "ALREADY_REGISTERED", "This registration has already been paid.");
  const parents = parentsStep.safeParse({
    guardians: [...(app.guardians as object[]), {}, {}, {}]
      .slice(0, 3)
      .map((g) => ({ relation: "Guardian", ...g })),
    contactEmail: app.contactEmail,
    contactPhone: app.contactPhone,
  });
  if (!app.contactEmail || !parents.success)
    throw new ApiError(422, "INCOMPLETE", "Please complete the parent details before paying.");
  const amountPaise = await registrationFeeFor(app);
  const name = ((app.guardians as { name?: string }[])[0]?.name ?? "Parent").slice(0, 80);
  const { order, checkout } = await createPaymentOrder({
    purpose: "REGISTRATION",
    amountPaise,
    customer: { name, email: app.contactEmail, phone: app.contactPhone, id: app.id },
    description: `Registration fee — ${app.childFirstName} ${app.childLastName} (${app.ref})`,
    idempotencyKey: `reg:${app.id}`,
    returnPath: `/admissions/register/complete?ref=${encodeURIComponent(app.ref)}`,
    applicationId: app.id,
    notes: { applicationRef: app.ref },
  });
  return NextResponse.json({ orderId: order.providerOrderId, amountPaise, checkout }, { status: 201 });
});
