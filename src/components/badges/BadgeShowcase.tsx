"use client";

import { useMemo, useState } from "react";
import { Award, SearchX } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SearchInput } from "@/components/ui/SearchInput";
import { useS } from "@/i18n/spaces";
import { cn } from "@/lib/utils";
import { CATEGORIES, RARITIES, rarityStyle } from "@/lib/badge-ranks";
import { isVisibleAchievement, type Achievement } from "@/lib/badge-collection";
import { BadgeCard } from "@/components/badges/BadgeCard";
import { BadgeDetailModal } from "@/components/badges/BadgeDetailModal";

export interface BadgeShowcaseProps {
  /** null = still loading; [] = genuinely empty. */
  achievements: Achievement[] | null;
  /** Pin toggle offered only on the owner's own collection. */
  isOwner: boolean;
  onTogglePin?: (achievement: Achievement) => void;
  /** XP context rendered BEFORE completion stats (visual hierarchy). */
  xpHeader?: {
    levelName: string;
    level: number;
    into: number;
    needed: number;
    xp: number;
  } | null;
}

type StateFilter = "all" | "unlocked" | "locked" | "progress";

/**
 * The dedicated badge experience shared by the Leaderboard "Badge
 * Achievements" tab and the Profile Badge Showcase. One card per achievement,
 * latest rank only, driven by the same aggregation for both surfaces.
 */
export function BadgeShowcase({ achievements, isOwner, onTogglePin, xpHeader }: BadgeShowcaseProps) {
  const t = useS();
  const [category, setCategory] = useState<string>("all");
  const [rarity, setRarity] = useState<string>("all");
  const [state, setState] = useState<StateFilter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Achievement | null>(null);

  const loading = achievements === null;
  // Visibility rules: secret/hidden badges stay hidden until earned; private
  // rows are owner-only. The rule lives in the shared aggregation module.
  const list = (achievements ?? []).filter((item) => isVisibleAchievement(item, isOwner));

  const unlockedCount = list.filter((item) => item.currentRank !== null).length;
  const completionPct = list.length > 0 ? Math.round((unlockedCount / list.length) * 100) : 0;

  // Data-driven categories: only the ones the collection actually contains.
  const presentCategories = useMemo(() => {
    const set = new Set(list.map((item) => item.category));
    return CATEGORIES.filter((item) => set.has(item));
  }, [list]);

  const visible = useMemo(() => {
    return list.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (rarity !== "all" && item.rarity !== rarity) return false;
      if (state === "unlocked" && item.currentRank === null) return false;
      if (state === "locked" && item.currentRank !== null) return false;
      if (state === "progress" && (item.currentRank !== null || item.progressValue === null || item.progressValue <= 0)) {
        return false;
      }
      const needle = query.trim().toLowerCase();
      return !needle || item.name.toLowerCase().includes(needle);
    });
  }, [list, category, rarity, state, query]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-44 animate-pulse rounded-xl border border-cova-line bg-cova-pale/40" aria-hidden="true" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {xpHeader && (
        <div className="rounded-xl border border-cova-line bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-48 flex-1">
              <p className="text-sm font-semibold text-cova-ink">
                {t("gm.yourLevel", { name: xpHeader.levelName, level: xpHeader.level })}
              </p>
              <ProgressBar
                value={xpHeader.needed > 0 ? xpHeader.into : 1}
                max={xpHeader.needed > 0 ? xpHeader.needed : 1}
                label={t("gm.yourLevel", { name: xpHeader.levelName, level: xpHeader.level })}
                className="mt-1.5"
              />
              <p className="mt-1 text-xs text-cova-mute">
                {xpHeader.xp.toLocaleString()} XP
                {xpHeader.needed > 0 && ` · ${t("gm.xpToNext", { into: xpHeader.into, needed: xpHeader.needed })}`}
              </p>
            </div>
            <div className="text-end">
              <p className="text-sm text-cova-mute">{t("gm.stats.achievements")}</p>
              <p className="text-xl font-semibold tabular-nums text-cova-ink">
                {unlockedCount} <span className="text-sm text-cova-mute">/ {list.length}</span>
              </p>
              <p className="text-xs text-cova-mute">{t("gm.stats.completion", { pct: completionPct })}</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          aria-label={t("gm.filter.category")}
          className="h-9 rounded-lg border border-cova-line bg-white px-2 text-sm"
        >
          <option value="all">{t("gm.filter.allCategories")}</option>
          {presentCategories.map((item) => (
            <option key={item} value={item}>
              {t(`gm.category.${item}` as never)}
            </option>
          ))}
        </select>
        <select
          value={rarity}
          onChange={(event) => setRarity(event.target.value)}
          aria-label={t("gm.filter.rarity")}
          className="h-9 rounded-lg border border-cova-line bg-white px-2 text-sm"
        >
          <option value="all">{t("gm.filter.allRarities")}</option>
          {RARITIES.map((item) => (
            <option key={item} value={item}>
              {t(`gm.rarity.${item}` as never)}
            </option>
          ))}
        </select>
        <select
          value={state}
          onChange={(event) => setState(event.target.value as StateFilter)}
          aria-label={t("gm.filter.state")}
          className="h-9 rounded-lg border border-cova-line bg-white px-2 text-sm"
        >
          <option value="all">{t("gm.filter.allStates")}</option>
          <option value="unlocked">{t("gm.filter.unlocked")}</option>
          <option value="locked">{t("gm.filter.locked")}</option>
          <option value="progress">{t("gm.filter.progress")}</option>
        </select>
        <div className="min-w-40 flex-1">
          <SearchInput label={t("gm.search")} placeholder={t("gm.search")} value={query} onChange={setQuery} />
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState icon={Award} title={t("gm.showcase.emptyTitle")} description={t("gm.showcase.emptyDescription")} />
      ) : visible.length === 0 ? (
        <EmptyState icon={SearchX} title={t("gm.showcase.noMatchTitle")} description={t("gm.showcase.noMatchDescription")} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((item) => (
            <BadgeCard
              key={item.key}
              achievement={item}
              onOpen={setSelected}
              pinnable={isOwner && !!onTogglePin}
              pinned={item.pinned}
              onTogglePin={onTogglePin}
            />
          ))}
        </div>
      )}

      <BadgeDetailModal achievement={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

/** Rarity chip helper reused by the comparison view. */
export function RarityChip({ rarity }: { rarity: string }) {
  const t = useS();
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", rarityStyle(rarity).chip)}>
      {t(`gm.rarity.${rarity}` as never)}
    </span>
  );
}
