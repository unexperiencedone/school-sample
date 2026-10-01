import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";

/** GET /api/admin/search?q= — role-aware global search over students, leads and applications. */
export const GET = route(
  async (req, { user }) => {
    const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) return NextResponse.json({ data: [] });
    const contains = { contains: q, mode: "insensitive" as const };
    const hits: { type: string; label: string; sub: string; href: string }[] = [];

    if (can(user!.role, "students:read")) {
      const students = await db.student.findMany({
        where: { OR: [{ firstName: contains }, { lastName: contains }, { admissionNo: contains }] },
        include: { class: true },
        take: 6,
      });
      hits.push(
        ...students.map((s) => ({
          type: "Student",
          label: `${s.firstName} ${s.lastName}`,
          sub: `${s.admissionNo} · ${s.class.name}`,
          href: `/admin/students/${s.id}`,
        })),
      );
    }
    if (can(user!.role, "leads:read")) {
      const leads = await db.lead.findMany({
        where: {
          mergedIntoId: null,
          OR: [{ parentName: contains }, { email: contains }, { phone: contains }, { childName: contains }],
        },
        take: 5,
        orderBy: { createdAt: "desc" },
      });
      hits.push(
        ...leads.map((l) => ({
          type: "Lead",
          label: l.parentName,
          sub: `${l.childName ?? "—"} · ${l.classApplying} · ${l.status}`,
          href: `/admin/leads/${l.id}`,
        })),
      );
    }
    if (can(user!.role, "applications:read")) {
      const apps = await db.application.findMany({
        where: {
          OR: [
            { ref: contains },
            { childFirstName: contains },
            { childLastName: contains },
            { contactEmail: contains },
          ],
        },
        take: 5,
      });
      hits.push(
        ...apps.map((a) => ({
          type: "Application",
          label: `${a.childFirstName} ${a.childLastName}`,
          sub: `${a.ref} · ${a.stage}`,
          href: `/admin/applications/${a.id}`,
        })),
      );
    }
    return NextResponse.json({ data: hits });
  },
  { permission: "dashboard:view" },
);
