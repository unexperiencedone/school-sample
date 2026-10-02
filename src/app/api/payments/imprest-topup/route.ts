import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, parseJson, route } from "@/lib/api";
import { createPaymentOrder } from "@/lib/services/payments";
import { portalContext } from "@/lib/services/portal";

const schema = z.object({
  studentId: z.string().min(1),
  amountPaise: z
    .number()
    .int()
    .min(50_000, "Top up at least ₹500")
    .max(2_000_000, "Top up at most ₹20,000 at a time"),
  idempotencyKey: z.string().min(8).max(100),
});

/** POST /api/payments/imprest-topup — a guardian tops up a boarder's pocket money through the gateway. */
export const POST = route(
  async (req, { user }) => {
    const body = await parseJson(req, schema);
    const { guardian, children } = await portalContext(user!);
    const child = children.find((c) => c.id === body.studentId);
    if (!guardian || !child) throw new ApiError(404, "NOT_FOUND", "Pupil not found");
    if (child.boardingType === "DAY")
      throw new ApiError(409, "DAY_PUPIL", "Pocket money is for boarders only.");
    const { order, checkout } = await createPaymentOrder({
      purpose: "IMPREST_TOPUP",
      amountPaise: body.amountPaise,
      customer: { name: guardian.name, email: user!.email, phone: guardian.phone, id: user!.id },
      description: `Pocket money top-up — ${child.firstName} ${child.lastName}`,
      idempotencyKey: `topup:${user!.id}:${body.idempotencyKey}`,
      returnPath: `/portal/pocket-money?child=${child.id}`,
      studentId: child.id,
    });
    return NextResponse.json({ orderId: order.providerOrderId, checkout }, { status: 201 });
  },
  { auth: true },
);
