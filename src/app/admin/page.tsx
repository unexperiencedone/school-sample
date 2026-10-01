import { requireStaff } from "@/lib/auth/session";
import { firstName } from "@/lib/utils";
import { PageHeader } from "@/components/crm/page-header";

export const metadata = { title: "Dashboard" };

export default async function AdminHome() {
  const user = await requireStaff("dashboard:view");
  return (
    <PageHeader
      title={`Good day, ${firstName(user.name)}`}
      description="Dashboard modules arrive in the next phases."
    />
  );
}
