"use client";

import { Menu, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { NotificationsPanel } from "@/components/layout/NotificationsPanel";
import { UserMenu } from "@/components/layout/UserMenu";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { useI18n } from "@/i18n/client";
import { useDemoState } from "@/lib/demo-store";
import { computeXp, levelFor } from "@/lib/progress";

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const state = useDemoState();
  const xp = computeXp(state);
  const { level } = levelFor(xp);
  const { dir } = useI18n();

  return (
    <header
      dir={dir}
      className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-cova-line bg-white/90 px-4 backdrop-blur sm:px-6"
    >
      <div className={dir === "rtl" ? "order-2 flex items-center gap-3" : "flex items-center gap-3"}>
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation"
          className="rounded-lg p-2 text-cova-ink hover:bg-cova-pale lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <Badge tone="outline">Demo workspace</Badge>
      </div>
      <div className={dir === "rtl" ? "order-1 flex items-center gap-2" : "flex items-center gap-2"}>
        <span className="hidden items-center gap-1.5 rounded-full bg-cova-pale px-3 py-1 text-xs font-medium text-cova-ink sm:inline-flex">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Level {level} · {xp.toLocaleString("en-US")} XP
        </span>
        <NotificationsPanel />
        <LanguageSwitcher className="hidden sm:inline-flex" />
        <UserMenu />
      </div>
    </header>
  );
}
