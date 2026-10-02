import { Document, Page, Path, Svg, Text, View } from "@react-pdf/renderer";
import { school, isDemoMode } from "@/config/school";
import { C } from "./theme";

export type IdCardData = {
  name: string;
  admissionNo: string;
  className: string;
  house: string | null;
  houseColour: string | null;
  boarding: string;
  validTo: string;
  initials: string;
};

/** CR80 card (85.6 × 54 mm). No medical or contact details on the card itself — it can be lost. */
export function IdCardPdf({ d }: { d: IdCardData }) {
  return (
    <Document title={`ID card — ${d.name}`} author={school.name}>
      <Page size={[242.6, 153]} style={{ fontFamily: "Helvetica", color: C.ink, padding: 0 }}>
        <View
          style={{
            backgroundColor: C.plum,
            paddingHorizontal: 12,
            paddingVertical: 7,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <Svg width={11} height={13} viewBox="0 0 48 56">
            <Path
              d="M4 54V24C4 12.95 12.95 4 24 4s20 8.95 20 20v30"
              stroke="#f1cf82"
              strokeWidth={4}
              fill="none"
            />
            <Path d="M15 42a9 9 0 0 1 18 0Z" fill="#f1cf82" />
          </Svg>
          <Text style={{ color: "#fbf7f0", fontFamily: "Times-Roman", fontSize: 10, marginLeft: 6 }}>
            {school.name}
          </Text>
          <Text style={{ color: "#f1cf82", fontSize: 6, marginLeft: "auto" }}>STUDENT</Text>
        </View>
        <View style={{ flexDirection: "row", padding: 10, gap: 10 }}>
          <View
            style={{
              width: 56,
              height: 68,
              borderRadius: 4,
              backgroundColor: C.cream,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 0.75,
              borderColor: C.line,
            }}
          >
            <Text style={{ fontFamily: "Times-Roman", fontSize: 20, color: C.plum }}>{d.initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10.5 }}>{d.name}</Text>
            <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 2 }}>
              {d.className} · {d.boarding}
            </Text>
            {d.house && (
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: d.houseColour ?? C.gold,
                    marginRight: 4,
                  }}
                />
                <Text style={{ fontSize: 7.5 }}>{d.house} house</Text>
              </View>
            )}
            <Text style={{ fontSize: 7, color: C.muted, marginTop: 8 }}>Admission no.</Text>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9, letterSpacing: 0.5 }}>
              {d.admissionNo}
            </Text>
          </View>
        </View>
        <View
          style={{
            position: "absolute",
            bottom: 6,
            left: 10,
            right: 10,
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ fontSize: 5.5, color: C.muted }}>
            If found, please return to {school.contact.phone}
          </Text>
          <Text style={{ fontSize: 5.5, color: C.muted }}>
            {isDemoMode() ? "SAMPLE · " : ""}Valid to {d.validTo}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
