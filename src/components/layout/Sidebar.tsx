"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { useI18n, useT } from "@/i18n/client";
import { navSections } from "@/lib/navigation";
import { useSocial } from "@/lib/social-store";
import { cn } from "@/lib/utils";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Desktop (fine pointers): a compact 66px icon rail that expands to the full
 * 256px navigation while hovered (or keyboard-focused) and collapses again
 * when the pointer leaves. The inner content keeps a fixed width, so the
 * width transition never reflows or wraps text.
 * Touch tablets stay fully expanded; mobile keeps the off-canvas drawer.
 */
export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const t = useT();
  const { dir } = useI18n();
  const social = useSocial();
  const unread = social.notifications.filter((n) => n.readAt === null).length;

  // Labels live in the fixed-width content, clipped by the collapsed rail and
  // faded to 0 so no letter peeks out; they reveal themselves on expansion.
  const railFade =
    "whitespace-nowrap transition-opacity duration-200 lg:pointer-fine:opacity-0 lg:pointer-fine:group-hover:opacity-100 lg:pointer-fine:group-focus-within:opacity-100";

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
          "group fixed inset-y-0 z-40 flex w-64 flex-col border-cova-line bg-white",
          "overflow-hidden transition-[width,transform,box-shadow] duration-200 ease-out",
          "lg:translate-x-0",
          "lg:pointer-fine:w-[66px] lg:pointer-fine:hover:w-64 lg:pointer-fine:focus-within:w-64 lg:pointer-coarse:w-64",
          "lg:pointer-fine:hover:shadow-xl",
          dir === "rtl" ? "right-0 border-l border-r-0" : "left-0 border-r border-l-0",
          open ? "translate-x-0" : dir === "rtl" ? "translate-x-full" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between px-5 lg:justify-start lg:px-[17px]">
          {/* Visibility lives on wrappers: the Logo always renders inline-flex,
              so hiding it through props would create a display conflict. */}
          <span className="lg:hidden">
            <Logo href="/dashboard" />
          </span>
          <span className="hidden items-center gap-2.5 lg:flex">
            <Logo markOnly href="/dashboard" />
            <span
              aria-hidden="true"
              className={cn(railFade, "text-lg font-semibold tracking-[0.18em] text-cova-ink")}
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
        <nav className="min-h-0 flex-1 overflow-hidden" aria-label="Sections">
          <div className="h-full w-64 overflow-x-hidden overflow-y-auto pb-6">
            {navSections.map((section) => (
              <div key={section.titleKey} className="mt-5 first:mt-2">
                <p className={cn(railFade, "px-3 pb-1.5 text-xs font-medium text-cova-mute")}>
                  {t(section.titleKey)}
                </p>
                <ul className="space-y-0.5">
                  {section.items.map(({ href, labelKey, label, icon: Icon }, index) => {
                    const active = pathname === href || pathname.startsWith(`${href}/`);
                    const itemKey = `${section.titleKey}-${href}-${index}`;
                    const itemLabel = label ? (label as Record<string, string>)["en"] : undefined;
                    const text = itemLabel ?? (labelKey ? t(labelKey) : href);
                    const showUnread = href === "/notifications" && unread > 0;
                    return (
                      <li key={itemKey} className="relative">
                        {showUnread && (
                          <span
                            aria-hidden="true"
                            className={cn(
                              "absolute top-[9px] z-10 hidden h-2.5 w-2.5 rounded-full bg-cova-muted ring-2 ring-white",
                              "lg:pointer-fine:inline-block lg:pointer-fine:group-hover:hidden",
                              dir === "rtl" ? "right-[38px]" : "left-[38px]",
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
                          <span className={cn("flex-1", dir === "rtl" && "text-right", railFade)}>
                            {text}
                          </span>
                          {showUnread && (
                            <span className="rounded-full bg-cova-soft px-2 py-0.5 text-xs text-cova-ink">
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
          </div>
        </nav>
      </aside>
    </>
  );
}
