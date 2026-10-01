import Link from "next/link";
import { LogOut } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { signOut } from "@/lib/auth";
import { adminNav } from "@/config/admin-nav";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { LogoMark } from "@/components/brand/logo";
import { AdminSidebar } from "@/components/crm/admin-sidebar";
import { ThemeToggle } from "@/components/crm/theme-toggle";
import { DemoRibbon } from "@/components/demo-ribbon";
import { CommandSearch } from "@/components/crm/command-search";
import { school } from "@/config/school";

export const metadata = {
  title: { default: "CRM", template: `%s · CRM · ${school.shortName}` },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const items = adminNav
    .filter((i) => can(user.role, i.permission))
    .map((i) => ({
      ...i,
      children: i.children?.filter((c) => !c.permission || can(user.role, c.permission)),
    }));

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div id="crm-root" className="bg-bg text-fg min-h-dvh">
      <a
        href="#main"
        className="focus:bg-primary focus:text-primary-fg sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <div className="flex">
        <aside className="border-line bg-elevated sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r px-3 py-4 lg:flex">
          <Link href="/admin" className="text-primary mb-5 flex items-center gap-2 px-2">
            <LogoMark className="h-7" />
            <span className="font-serif text-lg leading-none">{school.shortName}</span>
          </Link>
          <div className="flex-1 overflow-y-auto pr-1">
            <AdminSidebar items={items} />
          </div>
          <div className="border-line mt-3 border-t pt-3 text-xs">
            <p className="text-fg truncate font-medium">{user.name ?? user.email}</p>
            <p className="text-muted">{ROLE_LABELS[user.role]}</p>
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="border-line bg-elevated/90 sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4 backdrop-blur lg:px-6">
            <details className="relative lg:hidden">
              <summary className="border-line cursor-pointer list-none rounded-md border px-3 py-1.5 text-sm">
                Menu
              </summary>
              <div className="border-line bg-elevated shadow-lift absolute top-10 left-0 z-40 max-h-[80dvh] w-64 overflow-y-auto rounded-lg border p-3">
                <AdminSidebar items={items} />
              </div>
            </details>
            <CommandSearch />
            <div className="ml-auto flex items-center gap-1">
              <Link
                href="/"
                className="text-muted hover:bg-sunken hover:text-fg hidden rounded-md px-2.5 py-1.5 text-sm sm:block"
              >
                View website
              </Link>
              <ThemeToggle />
              <form action={logout}>
                <button
                  type="submit"
                  className="text-muted hover:bg-sunken hover:text-fg rounded-md p-2"
                  aria-label="Sign out"
                >
                  <LogOut className="size-4" />
                </button>
              </form>
            </div>
          </header>
          <main id="main" className="px-4 py-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
      <DemoRibbon tone="dark" className="right-3 left-auto" />
    </div>
  );
}
