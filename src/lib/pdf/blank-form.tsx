import { Text, View } from "@react-pdf/renderer";
import { s, SchoolDoc } from "./theme";

export type BlankFormSection = { heading: string; fields: string[]; note?: string };

/** Printable blank forms for the Resources page (the online forms remain the preferred route). */
export function BlankFormPdf({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: string;
  sections: BlankFormSection[];
}) {
  return (
    <SchoolDoc title={title} subtitle="Please write clearly in block capitals">
      <Text style={[s.p, s.muted]}>{intro}</Text>
      {sections.map((sec) => (
        <View key={sec.heading} wrap={false}>
          <Text style={s.h2}>{sec.heading}</Text>
          {sec.note && <Text style={[s.small, { marginBottom: 6 }]}>{sec.note}</Text>}
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
            {sec.fields.map((f) => (
              <View key={f} style={{ width: f.length > 40 ? "100%" : "48%" }}>
                <Text style={s.small}>{f}</Text>
                <View style={s.field} />
              </View>
            ))}
          </View>
        </View>
      ))}
      <View style={{ marginTop: 20, flexDirection: "row", justifyContent: "space-between" }}>
        <View style={{ width: "48%" }}>
          <Text style={s.small}>Signature of parent / guardian</Text>
          <View style={[s.field, { height: 28 }]} />
        </View>
        <View style={{ width: "30%" }}>
          <Text style={s.small}>Date</Text>
          <View style={[s.field, { height: 28 }]} />
        </View>
      </View>
    </SchoolDoc>
  );
}

export const BLANK_FORMS: Record<string, { title: string; intro: string; sections: BlankFormSection[] }> = {
  "admission-form": {
    title: "Admission form",
    intro:
      "Families are encouraged to register online at /admissions/register, which saves progress and takes the registration fee securely. Use this form only if you cannot register online.",
    sections: [
      {
        heading: "The child",
        fields: [
          "First name",
          "Last name",
          "Date of birth (DD/MM/YYYY)",
          "Gender",
          "Current school",
          "Class applying for",
          "Preferred start session",
          "Boarding type (Full / Flexi / Day)",
        ],
      },
      {
        heading: "Mother / guardian 1",
        fields: ["Full name", "Occupation", "Mobile", "Email", "Residential address (in full)"],
      },
      {
        heading: "Father / guardian 2",
        fields: ["Full name", "Occupation", "Mobile", "Email", "Residential address (if different)"],
      },
      {
        heading: "Documents enclosed",
        fields: [
          "Birth certificate (copy)",
          "Last report card (copy)",
          "Passport photograph",
          "ID proof of parent",
        ],
        note: "Tick each item and attach copies.",
      },
    ],
  },
  "health-form": {
    title: "Health and medical form",
    intro:
      "This information is confidential and shared only with the medical centre and, where necessary for her care, boarding staff.",
    sections: [
      { heading: "Pupil", fields: ["Name", "Date of birth", "Blood group", "Height / weight"] },
      {
        heading: "Medical history",
        fields: [
          "Allergies (food, medicine, other)",
          "Long-term conditions",
          "Current medication and dosage",
          "Previous surgeries or hospital stays",
        ],
      },
      {
        heading: "Immunisations",
        fields: ["Up to date? (Yes / No)", "Attach a copy of the immunisation record"],
      },
      {
        heading: "Family doctor & consent",
        fields: [
          "Doctor's name",
          "Doctor's phone",
          "I consent to emergency treatment if I cannot be reached (Yes / No)",
        ],
      },
    ],
  },
  "withdrawal-form": {
    title: "Withdrawal notice form",
    intro:
      "You can also give notice from the parent portal, which records the date automatically. Please read the refund policy on the fee pages.",
    sections: [
      { heading: "Pupil", fields: ["Name", "Admission number", "Class", "Boarding type"] },
      {
        heading: "Withdrawal",
        fields: [
          "Last day of attendance",
          "Reason (optional)",
          "Forwarding address for records",
          "Refund bank details (account name, number, IFSC)",
        ],
      },
    ],
  },
  "staff-application-form": {
    title: "Staff application form (printable)",
    intro:
      "We strongly prefer the online application at /careers/apply, which saves your progress. CVs cannot be accepted in place of this form (safer recruitment).",
    sections: [
      {
        heading: "1. Personal details",
        fields: ["Full name", "Previous names", "Date of birth", "Nationality", "Address", "Mobile", "Email"],
      },
      {
        heading: "2. Education & training",
        fields: ["Institution, qualification, grade, dates (attach continuation sheet)"],
      },
      {
        heading: "3. Current employment",
        fields: ["Employer", "Role", "Start date", "Notice period", "Reason for leaving"],
      },
      {
        heading: "4. Employment history",
        fields: ["All employment since leaving education, with dates. Explain any gaps."],
      },
      {
        heading: "5. References",
        fields: [
          "Referee 1: name, role, organisation, email, phone",
          "Referee 2: name, role, organisation, email, phone",
        ],
        note: "One referee must be your current or most recent employer.",
      },
      {
        heading: "6. Declaration",
        fields: [
          "Do you have any convictions, cautions or pending proceedings? (Yes / No — give details)",
          "I declare the information is true and complete",
        ],
      },
    ],
  },
  "uniform-list": {
    title: "Uniform and kit list",
    intro: "All items are available from the school shop. Please label everything with your daughter's name.",
    sections: [
      {
        heading: "Everyday uniform",
        fields: ["Blazer ×1", "Skirt or trousers ×3", "Shirts ×5", "Jumper ×2", "Black shoes ×1 pair"],
      },
      {
        heading: "Sports kit",
        fields: [
          "House T-shirts ×2",
          "Shorts / skort ×2",
          "Tracksuit ×1",
          "Trainers ×1 pair",
          "Swimsuit and cap",
        ],
      },
      {
        heading: "Boarders also bring",
        fields: [
          "Bedding set (school colours)",
          "Toiletries",
          "Reading lamp (LED)",
          "Labelled laundry bag ×2",
        ],
      },
    ],
  },
};
