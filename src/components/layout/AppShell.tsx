"use client";

import { useState, type ReactNode } from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { CallOverlay } from "@/components/messages/CallOverlay";
import { RoomRuntimeProvider } from "@/components/voicing/RoomRuntime";
import { useI18n, useT } from "@/i18n/client";
import { useSidebarPreference } from "@/lib/sidebar";
import { cn } from "@/lib/utils";

const SIDEBAR_STORAGE_KEY = "cova-sidebar";

/**
 * Push layout (spec Part 6): on desktop the sidebar owns its CSS Grid column —
 * opening it narrows the main area and the content reflows; nothing is hidden
 * behind an overlay, scroll and context are preserved, and the column width
 * animates as one system. Mobile keeps the off-canvas drawer with a backdrop.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const { collapsed, toggle } = useSidebarPreference(SIDEBAR_STORAGE_KEY, true);
  const { dir } = useI18n();
  const t = useT();

  return (
    <div dir={dir} className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2"
      >
        {t("common.skip")}
      </a>
      {/* Keeps one voice room alive across page navigation (mic + peers + SSE). */}
      <RoomRuntimeProvider>
        <div
          className={cn(
            "grid min-h-screen grid-cols-[minmax(0,1fr)] transition-[grid-template-columns] duration-300 ease-in-out",
            collapsed ? "lg:grid-cols-[72px_minmax(0,1fr)]" : "lg:grid-cols-[260px_minmax(0,1fr)]",
          )}
        >
          <Sidebar
            open={navOpen}
            onClose={() => setNavOpen(false)}
            collapsed={collapsed}
            onToggle={toggle}
          />
          <div className="min-w-0 overflow-x-hidden">
            <Header onMenuClick={() => setNavOpen(true)} />
            <main id="main" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
              {children}
            </main>
          </div>
        </div>
        {/* Global call screen: rings on every page while someone is signed in. */}
        <CallOverlay />
      </RoomRuntimeProvider>
    </div>
  );
}
