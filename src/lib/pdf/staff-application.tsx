import { Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { formatDate } from "@/lib/dates";
import { STEPS, type StaffApplicationData } from "@/lib/schemas/staff-application";
import {
  applicationGaps,
  monthLabel,
  safeguardingFlags,
  SCORE_CRITERIA,
  SCORE_MAX,
  scorecardTotal,
  STAGE_LABEL,
  type StoredScorecard,
} from "@/lib/services/careers-admin-rules";
import type { StaffAppStatus } from "@prisma/client";
import { C, s, SchoolDoc } from "./theme";

export type StaffApplicationPdfData = {
  ref: string;
  status: StaffAppStatus;
  email: string;
  vacancyTitle: string | null;
  submittedAt: Date | null;
  data: StaffApplicationData;
  scorecard: StoredScorecard | null;
};

const day = (v: string) => formatDate(`${v}T00:00:00Z`);
const or = (v: string | undefined | null) => (v && v.trim() ? v.trim() : "Not given");

function Pair({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: "row", marginBottom: 3 }} wrap={false}>
      <Text style={[s.muted, { width: 130 }]}>{k}</Text>
      <Text style={{ flex: 1 }}>{v}</Text>
    </View>
  );
}

/** Sections stay in one piece (so a heading is never stranded at the foot of a page) unless they are long prose. */
function Section({
  n,
  title,
  children,
  keepTogether = true,
}: {
  n: number;
  title: string;
  children: ReactNode;
  keepTogether?: boolean;
}) {
  return (
    <View style={{ marginTop: 6 }} wrap={!keepTogether}>
      <Text style={s.h2} minPresenceAhead={80}>
        {n}. {title}
      </Text>
      {children}
    </View>
  );
}

function Item({ children }: { children: ReactNode }) {
  return (
    <View style={[s.box, { marginVertical: 3 }]} wrap={false}>
      {children}
    </View>
  );
}

/** The whole application form on A4, one section per step, for panels and the personnel file. */
export function StaffApplicationPdf({ d }: { d: StaffApplicationPdfData }) {
  const { data } = d;
  const flags = safeguardingFlags(data);
  const gaps = applicationGaps(data, formatDate(new Date(), "yyyy-MM"));
  const p = data.personal;
  const dec = data.declaration;
  return (
    <SchoolDoc
      title="Staff application"
      subtitle={`${d.ref} · ${d.submittedAt ? `Submitted ${formatDate(d.submittedAt)}` : "Not submitted"}`}
    >
      <Text style={[s.h1, { lineHeight: 1.2, marginBottom: 6 }]}>{p?.fullName ?? d.email}</Text>
      <Text style={[s.muted, { marginBottom: 8 }]}>
        {d.vacancyTitle ? `Applying for ${d.vacancyTitle}` : "General application"} · Stage:{" "}
        {STAGE_LABEL[d.status]}
      </Text>

      {flags.length > 0 && (
        <View style={[s.box, { borderColor: C.kiln, borderWidth: 1.5 }]} wrap={false}>
          <Text style={[s.bold, { color: C.kiln }]}>SAFEGUARDING FLAG: read before progressing</Text>
          {flags.map((f) => (
            <View key={f.key} style={{ marginTop: 4 }}>
              <Text style={s.bold}>{f.label}</Text>
              <Text>{f.detail}</Text>
            </View>
          ))}
        </View>
      )}
      {gaps.length > 0 && (
        <View style={s.box} wrap={false}>
          <Text style={s.bold}>Employment gaps to explore at interview</Text>
          {gaps.map((g) => (
            <Text key={g.from}>
              {monthLabel(g.from)} to {monthLabel(g.to)} ({g.months} months)
            </Text>
          ))}
        </View>
      )}

      <Section n={1} title={STEPS[0].title}>
        <Pair k="Title and name" v={p ? `${p.title} ${p.fullName}` : "Not given"} />
        <Pair k="Date of birth" v={p ? day(p.dob) : "Not given"} />
        <Pair k="Gender" v={p ? p.gender.toLowerCase() : "Not given"} />
        <Pair k="Nationality" v={or(p?.nationality)} />
        <Pair k="Email" v={d.email} />
        <Pair k="Phone" v={or(p?.phone)} />
        <Pair k="Address" v={or(p?.address)} />
        <Pair k="Availability" v={or(p?.noticeOrAvailability)} />
      </Section>

      <Section n={2} title={STEPS[1].title}>
        <Pair k="Marital status" v={or(data.family?.maritalStatus)} />
        <Pair
          k="Children"
          v={
            data.family?.children?.length
              ? data.family.children.map((c) => `${c.name} (born ${day(c.dob)})`).join("; ")
              : "None listed"
          }
        />
        <Pair
          k="Emergency contact"
          v={
            data.family
              ? `${data.family.emergencyName} (${data.family.emergencyRelation}), ${data.family.emergencyPhone}`
              : "Not given"
          }
        />
      </Section>

      <Section n={3} title={STEPS[2].title}>
        {(data.education?.items ?? []).map((e) => (
          <Item key={`${e.qualification}${e.year}`}>
            <Text style={s.bold}>{e.qualification}</Text>
            <Text>
              {e.institution}, {e.year}
              {e.grade ? ` · ${e.grade}` : ""}
            </Text>
            <Text style={s.small}>
              {e.certificateKey ? "Certificate uploaded" : "No certificate uploaded"}
            </Text>
          </Item>
        ))}
      </Section>

      <Section n={4} title={STEPS[3].title}>
        {data.current?.employed ? (
          <>
            <Pair k="Employer" v={or(data.current.employer)} />
            <Pair k="Role" v={or(data.current.role)} />
            <Pair k="Since" v={data.current.since ? monthLabel(data.current.since) : "Not given"} />
            <Pair k="Notice period" v={or(data.current.noticePeriod)} />
            <Pair k="Reason for leaving" v={or(data.current.reasonForLeaving)} />
          </>
        ) : (
          <Text>Not currently employed.</Text>
        )}
      </Section>

      <Section n={5} title={STEPS[4].title}>
        {(data.history?.items ?? []).length === 0 && <Text>No earlier employment listed.</Text>}
        {(data.history?.items ?? []).map((j) => (
          <Item key={`${j.employer}${j.from}`}>
            <Text style={s.bold}>
              {j.role}, {j.employer}
            </Text>
            <Text>
              {monthLabel(j.from)} to {monthLabel(j.to)}
              {j.reasonForLeaving ? ` · Left: ${j.reasonForLeaving}` : ""}
            </Text>
          </Item>
        ))}
      </Section>

      <Section n={6} title={STEPS[5].title}>
        <Pair k="Subjects and areas" v={data.interests?.subjects?.join(", ") ?? "Not given"} />
        <Pair k="Phases" v={data.interests?.phases?.join(", ") ?? "Not given"} />
        <Pair k="Interests" v={or(data.interests?.interests)} />
      </Section>

      <Section n={7} title={STEPS[6].title} keepTogether={false}>
        {(data.statement?.text ?? "Not given").split(/\n+/).map((para, i) => (
          <Text key={i} style={s.p}>
            {para}
          </Text>
        ))}
      </Section>

      <Section n={8} title={STEPS[7].title}>
        {(data.references?.items ?? []).map((r) => (
          <Item key={r.email}>
            <Text style={s.bold}>
              {r.name}
              {r.isCurrentEmployer ? " (current or most recent employer)" : ""}
            </Text>
            <Text>
              {r.role}, {r.organisation}
            </Text>
            <Text>
              {r.email}
              {r.phone ? ` · ${r.phone}` : ""}
            </Text>
            <Text style={s.small}>{r.relationship}</Text>
          </Item>
        ))}
      </Section>

      <Section n={9} title={STEPS[8].title}>
        <Pair k="Safeguarding statement" v={dec?.safeguarding ? "Confirmed" : "Not confirmed"} />
        <Pair
          k="Convictions or cautions"
          v={dec?.convictions === "DECLARE" ? `Declared: ${or(dec.convictionsDetail)}` : "None declared"}
        />
        <Pair
          k="Pending action"
          v={dec?.pendingAction === "DECLARE" ? `Declared: ${or(dec.pendingActionDetail)}` : "None declared"}
        />
        <Pair k="Consent to process" v={dec?.consent ? "Given" : "Not given"} />
        <Pair k="Information accurate" v={dec?.truthful ? "Confirmed" : "Not confirmed"} />
      </Section>

      {d.scorecard && (
        <View style={{ marginTop: 6 }} wrap={false}>
          <Text style={s.h2}>Scorecard</Text>
          {SCORE_CRITERIA.map((c) => (
            <View key={c.key} style={s.row}>
              <Text style={{ flex: 1 }}>{c.label}</Text>
              <Text style={[s.right, { width: 60 }]}>{d.scorecard![c.key]} / 5</Text>
            </View>
          ))}
          <View style={[s.row, { borderBottomWidth: 0 }]}>
            <Text style={[s.bold, { flex: 1 }]}>Total</Text>
            <Text style={[s.bold, s.right, { width: 60 }]}>
              {scorecardTotal(d.scorecard)} / {SCORE_MAX}
            </Text>
          </View>
          {d.scorecard.comment ? (
            <Text style={[s.small, { marginTop: 4 }]}>{d.scorecard.comment}</Text>
          ) : null}
        </View>
      )}
      <Text style={[s.small, { marginTop: 18 }]}>
        Confidential: contains personal data. Handle under the school&apos;s data protection and safer
        recruitment policies.
      </Text>
    </SchoolDoc>
  );
}
