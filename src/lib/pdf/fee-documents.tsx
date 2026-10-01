import { Text, View } from "@react-pdf/renderer";
import { C, pdfMoney, s, SchoolDoc } from "./theme";
import { formatDate, formatDateTime } from "@/lib/dates";

export type ReceiptData = {
  number: string;
  issuedAt: Date;
  payer: string;
  student: string | null;
  className: string | null;
  admissionNo: string | null;
  method: string;
  reference: string | null;
  amountPaise: number;
  refundedPaise: number;
  allocations: { label: string; amountPaise: number }[];
  walletCreditPaise: number;
  purpose: string;
};

const METHOD: Record<string, string> = {
  UPI: "UPI",
  CARD: "Card",
  NETBANKING: "Net banking",
  WALLET: "Wallet",
  BANK_TRANSFER: "Bank transfer (NEFT/RTGS)",
  CHEQUE: "Cheque",
  DEMAND_DRAFT: "Demand draft",
  CASH: "Cash",
};

function Pair({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: "row", marginBottom: 3 }}>
      <Text style={[s.muted, { width: 110 }]}>{k}</Text>
      <Text style={{ flex: 1 }}>{v}</Text>
    </View>
  );
}

/** A fee receipt: one per payment, numbered gap-free per financial year. */
export function ReceiptPdf({ d }: { d: ReceiptData }) {
  return (
    <SchoolDoc title="Fee receipt" subtitle={`${d.number} · ${formatDate(d.issuedAt)}`}>
      <View style={s.box}>
        <Pair k="Receipt number" v={d.number} />
        <Pair k="Received" v={formatDateTime(d.issuedAt)} />
        <Pair k="Received from" v={d.payer} />
        {d.student && (
          <Pair
            k="Pupil"
            v={`${d.student}${d.className ? ` · ${d.className}` : ""}${d.admissionNo ? ` · ${d.admissionNo}` : ""}`}
          />
        )}
        <Pair k="For" v={d.purpose} />
        <Pair k="Method" v={`${METHOD[d.method] ?? d.method}${d.reference ? ` · Ref ${d.reference}` : ""}`} />
      </View>
      {d.allocations.length > 0 && (
        <>
          <Text style={s.h3}>Applied to</Text>
          <View style={[s.row, { borderBottomColor: C.muted }]}>
            <Text style={[s.th, { flex: 1 }]}>Instalment</Text>
            <Text style={[s.th, s.right, { width: 110 }]}>Amount</Text>
          </View>
          {d.allocations.map((a) => (
            <View key={a.label} style={s.row}>
              <Text style={{ flex: 1 }}>{a.label}</Text>
              <Text style={[s.right, { width: 110 }]}>{pdfMoney(a.amountPaise)}</Text>
            </View>
          ))}
          {d.walletCreditPaise > 0 && (
            <View style={s.row}>
              <Text style={{ flex: 1 }}>Held as credit on account</Text>
              <Text style={[s.right, { width: 110 }]}>{pdfMoney(d.walletCreditPaise)}</Text>
            </View>
          )}
        </>
      )}
      <View style={[s.row, { borderBottomWidth: 0, marginTop: 6 }]}>
        <Text style={[s.bold, { flex: 1, fontSize: 11 }]}>Total received</Text>
        <Text style={[s.bold, s.right, { width: 140, fontSize: 11 }]}>{pdfMoney(d.amountPaise)}</Text>
      </View>
      {d.refundedPaise > 0 && (
        <Text style={[s.small, { marginTop: 4 }]}>
          Refunded against this receipt: {pdfMoney(d.refundedPaise)}.
        </Text>
      )}
      <Text style={[s.small, { marginTop: 24 }]}>
        This is a computer-generated receipt and does not need a signature. Please quote the receipt number in
        any correspondence. Fees once paid are refundable only as set out in the school&apos;s fee and refund
        policy.
      </Text>
    </SchoolDoc>
  );
}

export type InvoiceData = {
  number: string;
  issuedAt: Date;
  year: string;
  student: string;
  className: string;
  admissionNo: string;
  boarding: string;
  plan: string;
  lines: { description: string; amountPaise: number; kind: string }[];
  subtotalPaise: number;
  discountPaise: number;
  rebatePaise: number;
  totalPaise: number;
  lateFeePaise: number;
  paidPaise: number;
  instalments: {
    label: string;
    dueDate: Date;
    amountPaise: number;
    lateFeePaise: number;
    paidPaise: number;
    status: string;
  }[];
  structureVersion: number;
  revised: boolean;
};

/** The annual fee invoice: charges, concessions, instalment schedule and what has been paid. */
export function InvoicePdf({ d }: { d: InvoiceData }) {
  const balance = d.totalPaise + d.lateFeePaise - d.paidPaise;
  return (
    <SchoolDoc
      title={d.revised ? "Fee invoice (revised)" : "Fee invoice"}
      subtitle={`${d.number} · ${d.year}`}
    >
      <View style={{ flexDirection: "row", gap: 16 }}>
        <View style={[s.box, { flex: 1 }]}>
          <Pair k="Pupil" v={d.student} />
          <Pair k="Class" v={`${d.className} · ${d.boarding}`} />
          <Pair k="Admission no." v={d.admissionNo} />
        </View>
        <View style={[s.box, { flex: 1 }]}>
          <Pair k="Invoice" v={d.number} />
          <Pair k="Issued" v={formatDate(d.issuedAt)} />
          <Pair k="Payment plan" v={d.plan} />
        </View>
      </View>
      <Text style={s.h3}>Charges for {d.year}</Text>
      <View style={[s.row, { borderBottomColor: C.muted }]}>
        <Text style={[s.th, { flex: 1 }]}>Item</Text>
        <Text style={[s.th, s.right, { width: 110 }]}>Amount</Text>
      </View>
      {d.lines.map((l, i) => (
        <View key={i} style={s.row}>
          <Text style={{ flex: 1, color: l.amountPaise < 0 ? C.kiln : C.ink }}>{l.description}</Text>
          <Text style={[s.right, { width: 110, color: l.amountPaise < 0 ? C.kiln : C.ink }]}>
            {pdfMoney(l.amountPaise)}
          </Text>
        </View>
      ))}
      {[
        ["Fees before concessions", d.subtotalPaise],
        ...(d.discountPaise ? [["Concessions", -d.discountPaise] as const] : []),
        ...(d.rebatePaise ? [["Advance-payment rebate", -d.rebatePaise] as const] : []),
      ].map(([k, v]) => (
        <View key={String(k)} style={[s.row, { borderBottomWidth: 0 }]}>
          <Text style={[s.muted, { flex: 1 }]}>{k}</Text>
          <Text style={[s.right, { width: 110 }]}>{pdfMoney(Number(v))}</Text>
        </View>
      ))}
      <View style={[s.row, { borderBottomWidth: 0 }]}>
        <Text style={[s.bold, { flex: 1, fontSize: 11 }]}>Invoice total</Text>
        <Text style={[s.bold, s.right, { width: 140, fontSize: 11 }]}>{pdfMoney(d.totalPaise)}</Text>
      </View>

      <Text style={s.h3}>Instalments</Text>
      <View style={[s.row, { borderBottomColor: C.muted }]}>
        <Text style={[s.th, { flex: 1 }]}>Instalment</Text>
        <Text style={[s.th, { width: 80 }]}>Due</Text>
        <Text style={[s.th, s.right, { width: 80 }]}>Amount</Text>
        <Text style={[s.th, s.right, { width: 70 }]}>Late fee</Text>
        <Text style={[s.th, s.right, { width: 80 }]}>Paid</Text>
        <Text style={[s.th, { width: 60, paddingLeft: 8 }]}>Status</Text>
      </View>
      {d.instalments.map((i) => (
        <View key={i.label} style={s.row}>
          <Text style={{ flex: 1 }}>{i.label}</Text>
          <Text style={{ width: 80 }}>{formatDate(i.dueDate)}</Text>
          <Text style={[s.right, { width: 80 }]}>{pdfMoney(i.amountPaise)}</Text>
          <Text style={[s.right, { width: 70 }]}>{i.lateFeePaise ? pdfMoney(i.lateFeePaise) : "—"}</Text>
          <Text style={[s.right, { width: 80 }]}>{pdfMoney(i.paidPaise)}</Text>
          <Text style={{ width: 60, paddingLeft: 8 }}>
            {i.status.charAt(0) + i.status.slice(1).toLowerCase()}
          </Text>
        </View>
      ))}
      <View style={[s.box, { marginTop: 12, flexDirection: "row", justifyContent: "space-between" }]}>
        <Text style={s.bold}>Balance due{d.lateFeePaise ? " (incl. late fees)" : ""}</Text>
        <Text style={s.bold}>{pdfMoney(Math.max(0, balance))}</Text>
      </View>
      <Text style={[s.small, { marginTop: 18 }]}>
        Calculated from fee structure version {d.structureVersion}. Pay online from the parent portal by UPI,
        card or net banking, or by bank transfer quoting the invoice number. Late fees apply after the grace
        period as set out in the fee policy.
      </Text>
    </SchoolDoc>
  );
}
