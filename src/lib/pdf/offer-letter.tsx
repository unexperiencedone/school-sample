import { Text, View } from "@react-pdf/renderer";
import { formatDate } from "@/lib/dates";
import { school } from "@/config/school";
import { pdfMoney, s, SchoolDoc } from "./theme";

export type OfferLetterData = {
  ref: string;
  parentName: string;
  childName: string;
  className: string;
  boarding: string;
  session: string;
  issuedAt: Date;
  acceptBy: Date;
  invoice?: {
    number: string;
    totalPaise: number;
    instalments: { label: string; dueDate: Date; amountPaise: number }[];
  } | null;
};

/** Offer of a place. Generated on demand from the application and its first-year invoice. */
export function OfferLetterPdf({ d }: { d: OfferLetterData }) {
  return (
    <SchoolDoc title="Offer of a place" subtitle={`Ref ${d.ref} · ${formatDate(d.issuedAt, "d MMMM yyyy")}`}>
      <Text style={s.p}>Dear {d.parentName},</Text>
      <Text style={s.p}>
        Thank you for your daughter&apos;s application to {school.name}. Following her assessment and the
        review by our admissions panel, we are delighted to offer {d.childName} a place in {d.className} as a{" "}
        {d.boarding.toLowerCase()} pupil, from the {d.session} academic session.
      </Text>
      <Text style={s.p}>
        To accept, please pay the first instalment shown below by {formatDate(d.acceptBy, "d MMMM yyyy")}. You
        can pay online from your applicant dashboard; your daughter&apos;s place is confirmed as soon as the
        payment is received.
      </Text>
      {d.invoice && (
        <View style={s.box}>
          <Text style={s.h3}>First-year fees · invoice {d.invoice.number}</Text>
          {d.invoice.instalments.map((i) => (
            <View key={i.label} style={s.row}>
              <Text style={{ flex: 2 }}>{i.label}</Text>
              <Text style={{ flex: 1 }}>due {formatDate(i.dueDate, "d MMM yyyy")}</Text>
              <Text style={[s.right, { flex: 1 }]}>{pdfMoney(i.amountPaise)}</Text>
            </View>
          ))}
          <View style={[s.row, { borderBottomWidth: 0 }]}>
            <Text style={[s.bold, { flex: 3 }]}>Total for the year</Text>
            <Text style={[s.bold, s.right, { flex: 1 }]}>{pdfMoney(d.invoice.totalPaise)}</Text>
          </View>
        </View>
      )}
      <Text style={s.p}>
        This offer is subject to the school&apos;s terms and fee policy, satisfactory original documents, and
        a health form before joining. If you have any questions, the admissions team is always happy to help.
      </Text>
      <Text style={[s.p, { marginTop: 18 }]}>With warm wishes,</Text>
      <Text style={{ fontFamily: "Times-Italic", fontSize: 14, color: "#3d1d38", marginTop: 6 }}>
        Dr. Helena Varghese
      </Text>
      <Text style={s.small}>Founding Principal (fictional, sample signature)</Text>
    </SchoolDoc>
  );
}
