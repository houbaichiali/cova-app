"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { useI18n, useT } from "@/i18n/client";
import { useAdminAccess } from "@/lib/admin-client";
import { navSections } from "@/lib/navigation";
import { useSocial } from "@/lib/social-store";
import { cn } from "@/lib/utils";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  /** Desktop push-layout state: compact 72px rail vs full 260px panel. */
  collapsed: boolean;
  onToggle: () => void;
}

/**
 * Push-layout sidebar (spec Part 6): on desktop it owns its grid column
 * (72px collapsed rail / 260px expanded panel — set by the AppShell grid, the
 * aside just fills it) and is toggled explicitly from its footer button; the
 * hover-expand overlay is gone. Labels fade instead of clipping, icons keep
 * their resting position. Mobile keeps the off-canvas drawer.
 */
export function Sidebar({ open, onClose, collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const t = useT();
  const { dir } = useI18n();
  const social = useSocial();
  const unread = social.notifications.filter((n) => n.readAt === null).length;
  // The Admin Center entry exists only for accounts the database recognizes
  // as admins — never shown (even hidden) for ordinary students.
  const admin = useAdminAccess();

  // Labels fade in place when the rail collapses; they are clipped by the
  // aside's overflow-hidden during the width transition.
  const labelFade = cn(
    "whitespace-nowrap transition-opacity duration-200",
    collapsed ? "lg:opacity-0" : "lg:opacity-100",
  );

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-cova-ink/30 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        aria-label={t("common.mainNav")}
        className={cn(
          "flex flex-col overflow-hidden border-cova-line bg-white",
          "max-lg:fixed max-lg:inset-y-0 max-lg:z-40 max-lg:w-64 max-lg:transition-transform max-lg:duration-200",
          "lg:sticky lg:top-0 lg:h-screen lg:w-auto",
          dir === "rtl" ? "max-lg:right-0 max-lg:border-l max-lg:border-r-0" : "max-lg:left-0 max-lg:border-r max-lg:border-l-0",
          open ? "max-lg:translate-x-0" : dir === "rtl" ? "max-lg:translate-x-full" : "max-lg:-translate-x-full",
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between px-4">
          <span className="flex items-center gap-2.5">
            {/* Visibility lives on wrappers: the Logo always renders inline-flex,
                so hiding it through props would create a display conflict. */}
            <Logo markOnly href="/dashboard" />
            <span
              aria-hidden="true"
              className={cn(labelFade, "text-lg font-semibold tracking-[0.18em] text-cova-ink")}
            >
              COVA
            </span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.closeNav")}
            className="rounded-lg p-1.5 text-cova-mute hover:bg-cova-pale lg:hidden"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto pb-6" aria-label="Sections">
          {navSections.map((section) => (
            <div key={section.titleKey} className="mt-5 first:mt-2">
              <p className={cn(labelFade, "px-3 pb-1.5 text-xs font-medium text-cova-mute")}>
                {t(section.titleKey)}
              </p>
              <ul className="space-y-0.5">
                {section.items.map(({ href, labelKey, label, icon: Icon }, index) => {
                  if (href === "/admin" && !admin.isAdmin) return null;
                  const active = pathname === href || pathname.startsWith(`${href}/`);
                  const itemKey = `${section.titleKey}-${href}-${index}`;
                  const itemLabel = label ? (label as Record<string, string>)["en"] : undefined;
                  const text = itemLabel ?? (labelKey ? t(labelKey) : href);
                  const showUnread = href === "/notifications" && unread > 0;
                  return (
                    <li key={itemKey} className="relative">
                      {showUnread && collapsed && (
                        <span
                          aria-hidden="true"
                          className={cn(
                            "absolute top-[9px] z-10 h-2.5 w-2.5 rounded-full bg-cova-muted ring-2 ring-white",
                            dir === "rtl" ? "right-[44px]" : "left-[44px]",
                          )}
                        />
                      )}
                      <Link
                        href={href}
                        onClick={onClose}
                        title={text}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          dir === "rtl" && "flex-row-reverse",
                          active
                            ? "bg-cova-pale text-cova-ink"
                            : "text-cova-mute hover:bg-cova-bg hover:text-cova-ink",
                        )}
                      >
                        <Icon className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
                        <span className={cn("flex-1", dir === "rtl" && "text-right", labelFade)}>
                          {text}
                        </span>
                        {showUnread && (
                          <span
                            className={cn(
                              "rounded-full bg-cova-soft px-2 py-0.5 text-xs text-cova-ink",
                              collapsed && "lg:hidden",
                            )}
                          >
                            {unread}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="shrink-0 border-t border-cova-line p-3">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            title={t("nav.toggleSidebar")}
            className="hidden w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-cova-mute transition-colors hover:bg-cova-bg hover:text-cova-ink lg:flex"
          >
            {collapsed ? (
              <PanelLeftOpen className={cn("h-4.5 w-4.5 shrink-0", dir === "rtl" && "rotate-180")} aria-hidden="true" />
            ) : (
              <PanelLeftClose className={cn("h-4.5 w-4.5 shrink-0", dir === "rtl" && "rotate-180")} aria-hidden="true" />
            )}
            <span className={labelFade}>{t("nav.toggleSidebar")}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
