import { route } from "@/lib/api";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { toCsv, csvResponse } from "@/lib/crm/csv";
import { leadWhere } from "@/lib/services/leads-admin";
import { leadRef } from "@/lib/services/leads";
import { formatDate } from "@/lib/dates";

/** GET /api/admin/leads/export?<filters>&ids= — CSV export (elevated permission, audit-logged). */
export const GET = route(
  async (req, { user }) => {
    const sp = Object.fromEntries(new URL(req.url).searchParams);
    const ids = sp.ids?.split(",").filter(Boolean);
    const where = ids?.length
      ? { id: { in: ids } }
      : leadWhere(
          {
            q: sp.q,
            status: sp.status,
            source: sp.source,
            classApplying: sp.class,
            assignee: sp.assignee,
            type: sp.type,
            from: sp.from,
            to: sp.to,
            utmSource: sp.utm,
          },
          user!.id,
        );
    const leads = await db.lead.findMany({
      where,
      include: { assignedTo: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 10_000,
    });
    await audit({
      actor: user,
      action: "lead.export",
      entity: "Lead",
      after: { count: leads.length, filters: sp },
      reason: "CSV export",
    });
    const csv = toCsv(
      [
        "Reference",
        "Received",
        "Type",
        "Source",
        "Status",
        "Parent",
        "Phone",
        "Email",
        "Child",
        "Child DOB",
        "Class",
        "Boarding",
        "Assigned to",
        "UTM source",
        "UTM medium",
        "UTM campaign",
        "Landing page",
        "Lost reason",
      ],
      leads.map((l) => [
        leadRef(l),
        formatDate(l.createdAt, "yyyy-MM-dd HH:mm"),
        l.type,
        l.source,
        l.status,
        l.parentName,
        l.phone,
        l.email,
        l.childName,
        l.childDob ? formatDate(l.childDob, "yyyy-MM-dd") : "",
        l.classApplying,
        l.preferredBoarding,
        l.assignedTo?.name,
        l.utmSource,
        l.utmMedium,
        l.utmCampaign,
        l.landingPage,
        l.lostReason,
      ]),
    );
    return csvResponse(`leads-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  },
  { permission: "leads:export" },
);
