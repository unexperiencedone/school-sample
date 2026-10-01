import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson, route } from "@/lib/api";
import { parseListParams } from "@/lib/crm/list";
import { listLeads, LEAD_SORTS } from "@/lib/services/leads-admin";
import { enquirySchema } from "@/lib/schemas/lead";
import { db } from "@/lib/db";
import { emitLeadEvent } from "@/lib/notify";

/**
 * GET /api/admin/leads?q=&status=&source=&class=&assignee=&type=&from=&to=&sort=&dir=&size=&after=&before=
 * Cursor-paginated list; same filters as the CRM inbox.
 */
export const GET = route(
  async (req, { user }) => {
    const sp = Object.fromEntries(new URL(req.url).searchParams);
    const p = parseListParams(sp, { sorts: LEAD_SORTS, defaultSort: "createdAt" });
    const { rows, next, prev, total } = await listLeads(
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
      p,
      user!.id,
    );
    return NextResponse.json({ data: rows, page: { next, prev, total } });
  },
  { permission: "leads:read" },
);

const createSchema = enquirySchema
  .omit({ captchaToken: true, captchaAnswer: true, website: true, consent: true, type: true, source: true })
  .extend({
    source: z.enum(["walk-in", "phone"]),
    consent: z.boolean().default(true),
  });

/** POST /api/admin/leads — staff create a lead from a walk-in or phone call (no captcha). */
export const POST = route(
  async (req, { user }) => {
    const d = await parseJson(req, createSchema);
    const lead = await db.lead.create({
      data: {
        source: d.source,
        parentName: d.parentName,
        phone: d.phone,
        email: d.email,
        childName: d.childName || null,
        classApplying: d.classApplying,
        preferredBoarding: d.preferredBoarding,
        message: d.message || null,
        consent: d.consent,
        consentAt: d.consent ? new Date() : null,
        assignedToId: user!.id,
        activities: {
          create: { kind: "CREATED", actorId: user!.id, body: `Created by staff (${d.source})` },
        },
      },
    });
    await emitLeadEvent("lead.created", {
      leadId: lead.id,
      status: lead.status,
      source: lead.source,
      parent: { name: lead.parentName, email: lead.email, phone: lead.phone },
      child: { name: lead.childName ?? undefined, classApplying: lead.classApplying },
    });
    return NextResponse.json({ data: lead }, { status: 201 });
  },
  { permission: "leads:write" },
);
