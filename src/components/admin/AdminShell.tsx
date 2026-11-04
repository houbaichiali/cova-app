"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, LayoutDashboard, Menu, Users, X } from "lucide-react";
import { useAdminAccess } from "@/lib/admin-client";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

interface AdminNavItem {
  href: string;
  labelKey: Parameters<ReturnType<typeof useT>>[0];
  icon: typeof LayoutDashboard;
  /** Permission required to see the entry (dashboard itself: any admin). */
  permission?: string;
}

/** Modules light up as their phases land — no placeholder entries. */
const NAV_ITEMS: AdminNavItem[] = [
  { href: "/admin", labelKey: "admin.nav.dashboard", icon: LayoutDashboard },
  { href: "/admin/users", labelKey: "admin.nav.users", icon: Users, permission: "users.read" },
];

/** Hybrid Premium admin chrome: navy sidebar, light workspace, COVA accents. */
export function AdminShell({ children }: { children: ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const access = useAdminAccess();

  return (
    <div className="min-h-screen bg-cova-bg">
      {open && (
        <div className="fixed inset-0 z-30 bg-cova-ink/50 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
      )}

      {/* Navy sidebar (always dark — the Hybrid Premium admin identity) */}
      <aside
        aria-label={t("admin.center.title")}
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-[#16283C] text-slate-200 transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-sm font-bold text-white">
              A
            </span>
            <span className="text-sm font-semibold uppercase tracking-[0.16em] text-white">
              {t("admin.center.title")}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t("common.closeNav")}
            className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 lg:hidden"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV_ITEMS.map(({ href, labelKey, icon: Icon, permission }) => {
            if (permission && !access.can(permission)) return null;
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active ? "bg-white/15 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white",
                )}
              >
                <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                {t(labelKey)}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4.5 w-4.5" aria-hidden="true" />
            {t("admin.nav.backToStudent")}
          </Link>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-cova-line bg-[#16283C] px-4 text-white lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("admin.nav.openMenu")}
          className="rounded-lg p-2 hover:bg-white/10"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <span className="text-sm font-semibold uppercase tracking-[0.16em]">{t("admin.center.title")}</span>
      </div>

      {/* Light workspace */}
      <div className="lg:pl-60">
        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
