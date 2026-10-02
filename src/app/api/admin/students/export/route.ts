import { route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { csvResponse, toCsv } from "@/lib/crm/csv";
import { formatDate } from "@/lib/dates";
import { directoryWhere } from "@/lib/services/students";

/**
 * GET /api/admin/students/export — the filtered directory as CSV. Contact details only; never medical data.
 * Exports are a SENSITIVE action and audit-logged with the filter used.
 */
export const GET = route(
  async (req, { user }) => {
    const url = new URL(req.url);
    const f = Object.fromEntries(url.searchParams);
    const rows = await db.student.findMany({
      where: directoryWhere({
        q: f.q,
        classId: f.class,
        houseId: f.house,
        boarding: f.boarding,
        status: f.status,
      }),
      include: {
        class: true,
        section: true,
        house: true,
        guardians: { include: { guardian: true }, orderBy: { isPrimary: "desc" } },
      },
      orderBy: [{ class: { order: "asc" } }, { lastName: "asc" }],
    });
    await audit({
      actor: user,
      action: "students.export",
      entity: "Student",
      after: { filter: f, rows: rows.length },
    });
    return csvResponse(
      `students-${formatDate(new Date(), "yyyy-MM-dd")}.csv`,
      toCsv(
        [
          "Admission no",
          "First name",
          "Last name",
          "Class",
          "Section",
          "House",
          "Boarding",
          "Status",
          "Date of birth",
          "Primary contact",
          "Phone",
          "Email",
        ],
        rows.map((s) => {
          const g = s.guardians[0]?.guardian;
          return [
            s.admissionNo,
            s.firstName,
            s.lastName,
            s.class.name,
            s.section?.name,
            s.house?.name,
            s.boardingType,
            s.status,
            formatDate(s.dob, "yyyy-MM-dd"),
            g?.name,
            g?.phone,
            g?.email,
          ];
        }),
      ),
    );
  },
  { permission: "students:export" },
);
