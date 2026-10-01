import "server-only";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import type { CurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/rbac";

/** Can this user see/pay this student's fees? Guardians (parent portal), the applicant who owns the application, or finance staff. */
export async function assertStudentFeeAccess(user: CurrentUser, studentId: string) {
  if (can(user.role, "fees:read")) return;
  const student = await db.student.findUnique({
    where: { id: studentId },
    select: {
      application: { select: { applicantUserId: true } },
      guardians: { select: { guardian: { select: { userId: true } } } },
    },
  });
  if (!student) throw new ApiError(404, "NOT_FOUND", "Student not found");
  const isGuardian = student.guardians.some((g) => g.guardian.userId === user.id);
  const isApplicant = student.application?.applicantUserId === user.id;
  if (!isGuardian && !isApplicant)
    throw new ApiError(403, "FORBIDDEN", "You can't access this student's fees");
}
