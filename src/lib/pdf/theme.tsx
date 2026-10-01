import { Document, Page, Path, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { school, isDemoMode } from "@/config/school";
import { formatINR } from "@/lib/money";

/**
 * Shared PDF look (built-in Helvetica/Times so no font files are needed).
 * Built-in PDF fonts lack the ₹ glyph, so PDFs print "Rs." — see `pdfMoney`.
 */
export const C = {
  plum: "#3d1d38",
  kiln: "#8f3f26",
  gold: "#c88a17",
  ink: "#231a21",
  muted: "#66555f",
  line: "#e7ddd0",
  cream: "#f4ece0",
};

export const s = StyleSheet.create({
  page: {
    paddingTop: 42,
    paddingBottom: 60,
    paddingHorizontal: 44,
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: C.ink,
    lineHeight: 1.45,
  },
  h1: { fontFamily: "Times-Roman", fontSize: 22, color: C.plum, marginBottom: 4 },
  h2: { fontFamily: "Times-Roman", fontSize: 15, color: C.plum, marginTop: 16, marginBottom: 6 },
  h3: { fontFamily: "Helvetica-Bold", fontSize: 10, color: C.ink, marginTop: 10, marginBottom: 4 },
  muted: { color: C.muted },
  small: { fontSize: 8, color: C.muted },
  p: { marginBottom: 6 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.line, paddingVertical: 4 },
  th: { fontFamily: "Helvetica-Bold", fontSize: 8.5, color: C.muted },
  right: { textAlign: "right" },
  bold: { fontFamily: "Helvetica-Bold" },
  box: { borderWidth: 0.75, borderColor: C.line, borderRadius: 4, padding: 10, marginVertical: 6 },
  field: { borderBottomWidth: 0.75, borderBottomColor: C.muted, height: 18, marginBottom: 8 },
});

export const pdfMoney = (paise: number) => formatINR(paise, { symbol: "Rs. " });

export function Letterhead({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        borderBottomWidth: 1.5,
        borderBottomColor: C.gold,
        paddingBottom: 12,
        marginBottom: 16,
      }}
      fixed
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Svg width={22} height={26} viewBox="0 0 48 56">
          <Path
            d="M4 54V24C4 12.95 12.95 4 24 4s20 8.95 20 20v30"
            stroke={C.plum}
            strokeWidth={3.5}
            fill="none"
          />
          <Path d="M15 42a9 9 0 0 1 18 0Z" fill={C.gold} />
          <Path d="M2 54h44" stroke={C.plum} strokeWidth={3.5} />
        </Svg>
        <View style={{ marginLeft: 8 }}>
          <Text style={{ fontFamily: "Times-Roman", fontSize: 15, color: C.plum }}>{school.name}</Text>
          <Text style={[s.small, { marginTop: 3 }]}>{school.contact.address.slice(1).join(", ")}</Text>
        </View>
      </View>
      <View style={{ alignItems: "flex-end", maxWidth: 230 }}>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 11, color: C.kiln, textAlign: "right" }}>
          {title}
        </Text>
        {subtitle && <Text style={[s.small, { textAlign: "right" }]}>{subtitle}</Text>}
      </View>
    </View>
  );
}

export function Footer() {
  return (
    <View
      style={{
        position: "absolute",
        bottom: 24,
        left: 44,
        right: 44,
        flexDirection: "row",
        justifyContent: "space-between",
      }}
      fixed
    >
      <Text style={s.small}>
        {school.legal.entity} · {school.contact.phone} · {school.contact.email}
        {isDemoMode() ? " · SAMPLE BUILD — fictional school, not a real document" : ""}
      </Text>
      <Text style={s.small} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

export function SchoolDoc({
  title,
  subtitle,
  children,
  size = "A4",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  size?: "A4" | [number, number];
}) {
  return (
    <Document
      title={`${title} — ${school.name}`}
      author={school.name}
      creator={school.name}
      producer="Aurelia Hall sample build"
    >
      <Page size={size} style={s.page}>
        <Letterhead title={title} subtitle={subtitle} />
        {children}
        <Footer />
      </Page>
    </Document>
  );
}
