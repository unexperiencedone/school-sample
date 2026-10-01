import "server-only";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { can } from "@/lib/rbac";
import type { CurrentUser } from "@/lib/auth/session";
import { InvoicePdf, ReceiptPdf } from "@/lib/pdf/fee-documents";
import { assertStudentFeeAccess } from "./fee-access";
import { BOARDING_LABEL } from "./fee-data";

/** Receipt PDF. Finance staff, the pupil's guardians, or the applicant who paid a registration fee. */
export async function receiptPdf(user: CurrentUser, receiptId: string) {
  const receipt = await db.receipt.findUnique({
    where: { id: receiptId },
    include: {
      payment: {
        include: {
          allocations: { include: { instalment: true, invoice: { select: { number: true } } } },
          wallet: true,
          order: true,
          application: {
            select: {
              ref: true,
              applicantUserId: true,
              childFirstName: true,
              childLastName: true,
              guardians: true,
            },
          },
          student: {
            include: {
              class: true,
              guardians: { include: { guardian: true }, orderBy: { isPrimary: "desc" } },
            },
          },
        },
      },
    },
  });
  if (!receipt) throw new ApiError(404, "NOT_FOUND", "Receipt not found");
  const p = receipt.payment;
  if (!can(user.role, "payments:read")) {
    if (p.studentId) await assertStudentFeeAccess(user, p.studentId);
    else if (p.application?.applicantUserId !== user.id)
      throw new ApiError(404, "NOT_FOUND", "Receipt not found");
  }
  const appGuardian = (p.application?.guardians as { name?: string }[] | undefined)?.[0]?.name;
  const customer = (p.order?.customer ?? {}) as { name?: string };
  const pdf = await renderToBuffer(
    // The component renders a <Document>; react-pdf's typing can't see through the wrapper
    createElement(ReceiptPdf, {
      d: {
        number: receipt.number,
        issuedAt: receipt.issuedAt,
        payer: p.student?.guardians[0]?.guardian.name ?? appGuardian ?? customer.name ?? "Parent / guardian",
        student: p.student
          ? `${p.student.firstName} ${p.student.lastName}`
          : p.application
            ? `${p.application.childFirstName} ${p.application.childLastName}`
            : null,
        className: p.student?.class.name ?? null,
        admissionNo: p.student?.status === "ACTIVE" ? p.student.admissionNo : null,
        method: p.method,
        reference: p.reference,
        amountPaise: p.amountPaise,
        refundedPaise: p.refundedPaise,
        allocations: p.allocations.map((a) => ({
          label: `${a.invoice.number}${a.instalment ? ` · ${a.instalment.label}` : ""}`,
          amountPaise: a.amountPaise,
        })),
        walletCreditPaise: p.wallet.filter((w) => w.amountPaise > 0).reduce((n, w) => n + w.amountPaise, 0),
        purpose: p.applicationId && !p.studentId ? `Registration fee (${p.application?.ref})` : "School fees",
      },
    }) as ReactElement<DocumentProps>,
  );
  return { pdf, filename: `receipt-${receipt.number.replace(/\//g, "-")}.pdf` };
}

/** Invoice PDF. Finance staff or the pupil's guardians / applicant. */
export async function invoicePdf(user: CurrentUser, invoiceId: string) {
  const inv = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      lines: { orderBy: { id: "asc" } },
      instalments: { orderBy: { seq: "asc" } },
      plan: true,
      year: true,
      structure: true,
      student: { include: { class: true } },
    },
  });
  if (!inv) throw new ApiError(404, "NOT_FOUND", "Invoice not found");
  if (!can(user.role, "fees:read")) await assertStudentFeeAccess(user, inv.studentId);
  const breakdown = (inv.breakdown ?? {}) as { repricedAt?: string };
  const pdf = await renderToBuffer(
    createElement(InvoicePdf, {
      d: {
        number: inv.number,
        issuedAt: inv.issuedAt,
        year: inv.year.name,
        student: `${inv.student.firstName} ${inv.student.lastName}`,
        className: inv.student.class.name,
        admissionNo: inv.student.status === "ACTIVE" ? inv.student.admissionNo : "On admission",
        boarding: BOARDING_LABEL[inv.student.boardingType],
        plan: inv.plan.name,
        lines: inv.lines.map((l) => ({
          description: l.description,
          amountPaise: l.amountPaise,
          kind: l.kind,
        })),
        subtotalPaise: inv.subtotalPaise,
        discountPaise: inv.discountPaise,
        rebatePaise: inv.rebatePaise,
        totalPaise: inv.totalPaise,
        lateFeePaise: inv.lateFeePaise,
        paidPaise: inv.paidPaise,
        instalments: inv.instalments.map((i) => ({
          label: i.label,
          dueDate: i.dueDate,
          amountPaise: i.amountPaise,
          lateFeePaise: i.lateFeeWaived ? 0 : i.lateFeePaise,
          paidPaise: i.paidPaise,
          status: i.status,
        })),
        structureVersion: inv.structure.version,
        revised: !!breakdown.repricedAt,
      },
    }) as ReactElement<DocumentProps>,
  );
  return { pdf, filename: `invoice-${inv.number.replace(/\//g, "-")}.pdf` };
}
