import Link from "next/link";
import { Toaster } from "sonner";
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
    <div id="crm-root" className="min-h-dvh bg-bg text-fg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-fg"
      >
        Skip to content
      </a>
      <div className="flex">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-elevated px-3 py-4 lg:flex">
          <Link href="/admin" className="mb-5 flex items-center gap-2 px-2 text-primary">
            <LogoMark className="h-7" />
            <span className="font-serif text-lg leading-none">{school.shortName}</span>
          </Link>
          <div className="flex-1 overflow-y-auto pr-1">
            <AdminSidebar items={items} />
          </div>
          <div className="mt-3 border-t border-line pt-3 text-xs">
            <p className="truncate font-medium text-fg">{user.name ?? user.email}</p>
            <p className="text-muted">{ROLE_LABELS[user.role]}</p>
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-elevated/90 px-4 backdrop-blur lg:px-6">
            <details className="relative lg:hidden">
              <summary className="cursor-pointer list-none rounded-md border border-line px-3 py-1.5 text-sm">
                Menu
              </summary>
              <div className="absolute top-10 left-0 z-40 max-h-[80dvh] w-64 overflow-y-auto rounded-lg border border-line bg-elevated p-3 shadow-lift">
                <AdminSidebar items={items} />
              </div>
            </details>
            <CommandSearch />
            <div className="ml-auto flex items-center gap-1">
              <Link
                href="/"
                className="hidden rounded-md px-2.5 py-1.5 text-sm text-muted hover:bg-sunken hover:text-fg sm:block"
              >
                View website
              </Link>
              <ThemeToggle />
              <form action={logout}>
                <button
                  type="submit"
                  className="rounded-md p-2 text-muted hover:bg-sunken hover:text-fg"
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
      <DemoRibbon tone="dark" />
      <Toaster position="bottom-right" toastOptions={{ classNames: { toast: "font-sans" } }} />
    </div>
  );
}
