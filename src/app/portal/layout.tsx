import Link from "next/link";
import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { Toaster } from "sonner";
import { requireRole } from "@/lib/auth/session";
import { signOut } from "@/lib/auth";
import { portalContext } from "@/lib/services/portal";
import { Logo } from "@/components/brand/logo";
import { DemoRibbon } from "@/components/demo-ribbon";
import { PortalNav } from "@/components/portal/portal-nav";

export const metadata = {
  title: { default: "Parent portal", template: "%s · Parent portal" },
  robots: { index: false, follow: false },
};

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(["PARENT"]);
  const { guardian, children: kids } = await portalContext(user);
  const boarders = kids.some((k) => k.boardingType !== "DAY");
  async function logout() {
    "use server";
    await signOut({ redirectTo: "/" });
  }
  const items = [
    { href: "/portal", label: "Overview" },
    { href: "/portal/fees", label: "Fees" },
    ...(boarders ? [{ href: "/portal/pocket-money", label: "Pocket money" }] : []),
    { href: "/portal/circulars", label: "Circulars" },
    { href: "/portal/documents", label: "Documents" },
    { href: "/portal/requests", label: "Requests" },
    { href: "/portal/profile", label: "Profile & privacy" },
  ];
  return (
    <div className="min-h-dvh bg-bg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-fg"
      >
        Skip to content
      </a>
      <header className="border-b border-line bg-elevated">
        <div className="container-site flex h-16 items-center justify-between gap-4">
          <Link href="/portal" className="text-primary">
            <Logo />
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted sm:inline">{guardian?.name ?? user.email}</span>
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
      <Suspense>
        <PortalNav
          items={items}
          kids={kids.map((k) => ({ id: k.id, name: k.firstName, className: k.class.name }))}
        />
      </Suspense>
      <main id="main" className="container-site py-8 sm:py-10">
        {children}
      </main>
      <DemoRibbon />
      <Toaster position="bottom-right" />
    </div>
  );
}
