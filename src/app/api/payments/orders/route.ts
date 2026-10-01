import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, parseJson, route } from "@/lib/api";
import { db } from "@/lib/db";
import { createPaymentOrder } from "@/lib/services/payments";
import { assertStudentFeeAccess } from "@/lib/services/fee-access";
import { outstanding } from "@/lib/fee-engine";
import { toInstalmentState } from "@/lib/services/ledger";
import { formatINR } from "@/lib/money";

const schema = z
  .object({
    invoiceId: z.string().optional(),
    instalmentId: z.string().optional(),
    /** Custom part-payment (allowed when the school enables it). */
    amountPaise: z.number().int().positive().optional(),
    /** Client-generated key so double clicks never create two orders. */
    idempotencyKey: z.string().min(8).max(100),
  })
  .refine((v) => v.invoiceId || v.instalmentId, "invoiceId or instalmentId is required");

/** POST /api/payments/orders — create a gateway order for an invoice, an instalment, or a custom amount. */
export const POST = route(
  async (req, { user }) => {
    const body = await parseJson(req, schema);
    const instalment = body.instalmentId
      ? await db.instalment.findUnique({ where: { id: body.instalmentId }, include: { invoice: true } })
      : null;
    const invoice =
      instalment?.invoice ??
      (body.invoiceId
        ? await db.invoice.findUnique({ where: { id: body.invoiceId }, include: { instalments: true } })
        : null);
    if (!invoice) throw new ApiError(404, "NOT_FOUND", "Invoice not found");
    if (["PAID", "VOID", "WAIVED"].includes(invoice.status))
      throw new ApiError(409, "NOTHING_DUE", "Nothing is due on this invoice.");
    await assertStudentFeeAccess(user!, invoice.studentId);

    const instalments = instalment
      ? [instalment]
      : await db.instalment.findMany({ where: { invoiceId: invoice.id, status: { not: "WAIVED" } } });
    const due = instalments.reduce((a, i) => a + outstanding(toInstalmentState(i)), 0);
    if (due <= 0) throw new ApiError(409, "NOTHING_DUE", "Nothing is due.");
    let amountPaise = due;
    if (body.amountPaise !== undefined) {
      const setting = await db.setting.findUnique({ where: { key: "allow_custom_amount" } });
      if (setting?.value !== true)
        throw new ApiError(
          422,
          "CUSTOM_DISABLED",
          "Part payments aren't enabled. Please pay the full instalment.",
        );
      if (body.amountPaise < 100_000 || body.amountPaise > due)
        throw new ApiError(422, "BAD_AMOUNT", `Enter an amount between ₹1,000 and ${formatINR(due)}.`);
      amountPaise = body.amountPaise;
    }
    const student = await db.student.findUniqueOrThrow({
      where: { id: invoice.studentId },
      include: { application: true },
    });
    const guardian = await db.guardian.findFirst({ where: { userId: user!.id } });
    const phone = guardian?.phone ?? student.application?.contactPhone ?? "";
    const { order, checkout } = await createPaymentOrder({
      purpose: instalment ? "INSTALMENT" : body.amountPaise ? "CUSTOM" : "INVOICE",
      amountPaise,
      customer: { name: user!.name ?? "Parent", email: user!.email, phone, id: user!.id },
      description: `${instalment ? instalment.label : "Fees"} — ${student.firstName} ${student.lastName} (${invoice.number})`,
      idempotencyKey: `pay:${user!.id}:${body.idempotencyKey}`,
      returnPath: user!.role === "APPLICANT" ? "/applicant" : "/portal/fees",
      invoiceId: invoice.id,
      instalmentId: instalment?.id ?? null,
      studentId: student.id,
    });
    return NextResponse.json({ orderId: order.providerOrderId, amountPaise, checkout }, { status: 201 });
  },
  { auth: true },
);
