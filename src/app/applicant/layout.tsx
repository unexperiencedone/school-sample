import Link from "next/link";
import { LogOut } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { signOut } from "@/lib/auth";
import { Logo } from "@/components/brand/logo";
import { DemoRibbon } from "@/components/demo-ribbon";

export const metadata = { title: "Your application", robots: { index: false, follow: false } };

export default async function ApplicantLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(["APPLICANT", "PARENT"]);
  async function logout() {
    "use server";
    await signOut({ redirectTo: "/" });
  }
  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-line bg-elevated">
        <div className="container-site flex h-16 items-center justify-between">
          <Link href="/" className="text-primary">
            <Logo />
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {user.role === "PARENT" && (
              <Link href="/portal" className="underline">
                Parent portal
              </Link>
            )}
            <span className="hidden text-muted sm:inline">{user.email}</span>
            <form action={logout}>
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-sunken"
                aria-label="Sign out"
              >
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" className="container-site py-10">
        {children}
      </main>
      <DemoRibbon />
    </div>
  );
}
