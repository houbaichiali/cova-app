"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, BarChart3, BookOpenCheck, LayoutDashboard, Menu, PanelLeftClose, PanelLeftOpen, ScrollText, Settings, ShieldAlert, ShieldPlus, SlidersHorizontal, Trophy, UserCog, Users, X } from "lucide-react";
import { useAdminAccess } from "@/lib/admin-client";
import { useI18n, useT } from "@/i18n/client";
import { useSidebarPreference } from "@/lib/sidebar";
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
  { href: "/admin/moderation", labelKey: "admin.nav.moderation", icon: ShieldAlert, permission: "moderation.reports.read" },
  { href: "/admin/rules", labelKey: "admin.nav.rules", icon: ScrollText, permission: "rules.read" },
  { href: "/admin/content", labelKey: "admin.nav.content", icon: BookOpenCheck, permission: "content.review" },
  { href: "/admin/gamification", labelKey: "admin.nav.gamification", icon: Trophy, permission: "gamification.badges.manage" },
  { href: "/admin/reward-rules", labelKey: "admin.nav.rewardRules", icon: SlidersHorizontal, permission: "gamification.rules.manage" },
  { href: "/admin/analytics", labelKey: "admin.nav.analytics", icon: BarChart3, permission: "analytics.read" },
  { href: "/admin/security", labelKey: "admin.nav.security", icon: ShieldPlus, permission: "security.read" },
  { href: "/admin/settings", labelKey: "admin.nav.settings", icon: Settings, permission: "settings.manage" },
  { href: "/admin/team", labelKey: "admin.nav.team", icon: UserCog, permission: "team.manage" },
];

/** Hybrid Premium admin chrome: navy sidebar, light workspace, COVA accents.
 * Fully RTL-mirrored (Arabic) like the student AppShell.
 * Push layout: on desktop the navy sidebar owns its grid column (collapsed
 * 64px rail / expanded 240px panel, persisted) — the workspace narrows and
 * reflows, never hidden behind an overlay. Mobile keeps the drawer. */
export function AdminShell({ children }: { children: ReactNode }) {
  const t = useT();
  const { dir } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { collapsed, toggle: toggleSidebar } = useSidebarPreference("cova-admin-sidebar", false);
  const access = useAdminAccess();
  const rtl = dir === "rtl";

  // Admin labels fade in place when the rail collapses (nav stays usable,
  // icons keep their resting position, tooltips come from `title`).
  const labelFade = cn(
    "whitespace-nowrap transition-opacity duration-200",
    collapsed ? "lg:opacity-0" : "lg:opacity-100",
  );

  return (
    <div dir={dir} className="min-h-screen bg-cova-bg">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2"
      >
        {t("common.skip")}
      </a>
      {open && (
        <div className="fixed inset-0 z-30 bg-cova-ink/50 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
      )}

      <div
        className={cn(
          "grid min-h-screen grid-cols-[minmax(0,1fr)] transition-[grid-template-columns] duration-300 ease-in-out",
          collapsed ? "lg:grid-cols-[64px_minmax(0,1fr)]" : "lg:grid-cols-[240px_minmax(0,1fr)]",
        )}
      >
        {/* Navy sidebar (always dark — the Hybrid Premium admin identity) */}
        <aside
          aria-label={t("admin.center.title")}
          className={cn(
            "flex flex-col overflow-hidden bg-admin-navy text-slate-200",
            "max-lg:fixed max-lg:inset-y-0 max-lg:z-40 max-lg:w-60 max-lg:transition-transform max-lg:duration-200",
            "lg:sticky lg:top-0 lg:h-screen lg:w-auto",
            rtl ? "max-lg:right-0" : "max-lg:left-0",
            open ? "max-lg:translate-x-0" : rtl ? "max-lg:translate-x-full" : "max-lg:-translate-x-full",
          )}
        >
          <div
            className={cn(
              "flex h-16 shrink-0 items-center justify-between border-b border-admin-navy-line",
              collapsed ? "lg:px-4" : "px-5",
            )}
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm font-bold text-white">
                A
              </span>
              <span className={cn(labelFade, "text-sm font-semibold uppercase tracking-[0.16em] text-white")}>
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

          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
            {NAV_ITEMS.map(({ href, labelKey, icon: Icon, permission }) => {
              if (permission && !access.can(permission)) return null;
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  title={t(labelKey)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active ? "bg-white/15 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <Icon className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
                  <span className={labelFade}>{t(labelKey)}</span>
                </Link>
              );
            })}
          </nav>

          <div className="space-y-1 border-t border-admin-navy-line p-3">
            <button
              type="button"
              onClick={toggleSidebar}
              aria-expanded={!collapsed}
              title={t("nav.toggleSidebar")}
              className="hidden w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white lg:flex"
            >
              {collapsed ? (
                <PanelLeftOpen className={cn("h-4.5 w-4.5 shrink-0", rtl && "rotate-180")} aria-hidden="true" />
              ) : (
                <PanelLeftClose className={cn("h-4.5 w-4.5 shrink-0", rtl && "rotate-180")} aria-hidden="true" />
              )}
              <span className={labelFade}>{t("nav.toggleSidebar")}</span>
            </button>
            <Link
              href="/dashboard"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className={cn("h-4.5 w-4.5 shrink-0", rtl && "rotate-180")} aria-hidden="true" />
              <span className={labelFade}>{t("admin.nav.backToStudent")}</span>
            </Link>
          </div>
        </aside>

        {/* Mobile top bar */}
        <div className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-admin-navy-line bg-admin-navy px-4 text-white lg:hidden">
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

        {/* Light workspace (mirrored for RTL) */}
        <div className="min-w-0 overflow-x-hidden">
          <main id="admin-main" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
