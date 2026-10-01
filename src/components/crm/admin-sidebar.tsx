"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BriefcaseBusiness,
  CalendarDays,
  ChartColumn,
  CreditCard,
  GraduationCap,
  Inbox,
  LayoutDashboard,
  Megaphone,
  PenLine,
  ReceiptIndianRupee,
  School,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { AdminNavItem } from "@/config/admin-nav";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  Inbox,
  CalendarDays,
  GraduationCap,
  School,
  Users,
  ReceiptIndianRupee,
  CreditCard,
  Wallet,
  BriefcaseBusiness,
  Megaphone,
  PenLine,
  ChartColumn,
  Settings,
};

export function AdminSidebar({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(href + "/");
  return (
    <nav aria-label="CRM modules" className="flex flex-col gap-0.5 text-sm">
      {items.map((item) => {
        const Icon = ICONS[item.icon] ?? LayoutDashboard;
        const active = isActive(item.href) || item.children?.some((c) => isActive(c.href));
        return (
          <div key={item.href}>
            <Link
              href={item.href}
              aria-current={isActive(item.href) && !item.children ? "page" : undefined}
              className={cn(
                "text-muted hover:bg-sunken hover:text-fg flex items-center gap-2.5 rounded-md px-2.5 py-1.5 transition-colors",
                active && "bg-sunken text-fg font-medium",
              )}
            >
              <Icon className={cn("size-4", active && "text-primary")} aria-hidden />
              {item.label}
            </Link>
            {active && item.children && (
              <ul className="border-line mt-0.5 mb-1.5 ml-[1.15rem] border-l pl-3">
                {item.children.map((c) => (
                  <li key={c.href}>
                    <Link
                      href={c.href}
                      aria-current={pathname === c.href ? "page" : undefined}
                      className={cn(
                        "text-muted hover:text-fg block rounded px-2 py-1 text-[0.8rem]",
                        pathname === c.href && "text-primary font-medium",
                      )}
                    >
                      {c.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
