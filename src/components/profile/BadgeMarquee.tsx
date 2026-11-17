"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Award, Sparkles, Trophy } from "lucide-react";

import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { BadgeDetailModal } from "@/components/badges/BadgeDetailModal";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { getSupabase } from "@/lib/supabase/client";
import { badgeStem, buildAchievements, type Achievement } from "@/lib/badge-collection";
import { rankStyle, rarityStyle, RANK_COUNT } from "@/lib/badge-ranks";
import type { BadgeDefinition, MyBadge } from "@/lib/gamification";
import type { EarnedBadge } from "@/lib/profile-data";

/**
 * Infinite horizontal badge marquee over EARNED badges only, using the
 * evolving-badge rule: ONE chip per achievement, showing the highest achieved
 * edition colored with its rank identity. Clicking a chip opens the full
 * eight-rank progression view when the definitions are resolvable, with a
 * graceful fallback to the simple earned-on modal otherwise.
 *  - seamless loop (the track is rendered twice)
 *  - pauses on hover
 *  - honors prefers-reduced-motion (static wrapped grid instead)
 *  - honest empty state when nothing has been earned
 */

export interface BadgeMarqueeProps {
  badges: EarnedBadge[];
  /** Definitions enable the collapsed, rank-colored chips + rich detail view. */
  definitions?: BadgeDefinition[] | null;
  /** Portfolio owner uuid and/or public code (rank-award lookup for the detail view). */
  ownerId?: string | null;
  ownerCode?: string | null;
  /** Background/border come from the appearance editor; text color for contrast. */
  className?: string;
  style?: CSSProperties;
  textStyle?: CSSProperties;
  emptyLabel?: string;
}

interface Chip {
  key: string;
  name: string;
  gradient: string;
  textColor: string;
  imageUrl: string | null;
  rank: number | null;
  awardedAt: string;
  recipientNumber: number | null;
  fallback: EarnedBadge;
}

export function BadgeMarquee({
  badges,
  definitions,
  ownerId,
  ownerCode,
  className,
  style,
  textStyle,
  emptyLabel,
}: BadgeMarqueeProps) {
  const t = useT();
  const [fetchedDefs, setFetchedDefs] = useState<BadgeDefinition[] | null>(null);
  const [resolvedOwnerId, setResolvedOwnerId] = useState<string | null>(ownerId ?? null);
  const [selected, setSelected] = useState<Chip | null>(null);
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);
  const [showAll, setShowAll] = useState(false);

  const effectiveDefs = definitions ?? fetchedDefs;

  const chips = useMemo<Chip[]>(() => {
    if (!effectiveDefs) {
      // Legacy one-chip-per-earned-badge (definitions unavailable).
      return badges.map((badge) => ({
        key: badge.badge_key,
        name: badge.name,
        gradient: rarityStyle(badge.rarity).gradient,
        textColor: "text-white",
        imageUrl: badge.image_url,
        rank: null,
        awardedAt: badge.awarded_at,
        recipientNumber: badge.recipient_number,
        fallback: badge,
      }));
    }
    // Collapsed: one chip per achievement stem, highest achieved edition wins.
    const map = new Map<string, Chip>();
    for (const badge of badges) {
      const stem = badgeStem(badge.name);
      const family = effectiveDefs
        .filter((definition) => badgeStem(definition.name) === stem)
        .sort((a, b) => a.threshold - b.threshold);
      const position = family.findIndex((definition) => definition.key === badge.badge_key) + 1;
      const existing = map.get(stem);
      // The rows arrive newest first; keep the highest-threshold edition.
      if (existing && existing.rank !== null && position <= existing.rank) continue;
      map.set(stem, {
        key: stem,
        name: (badge.name.split("·")[0] ?? badge.name).trim(),
        gradient: position > 0 ? "" : rarityStyle(badge.rarity).gradient,
        textColor: "text-white",
        imageUrl: badge.image_url,
        rank: position > 0 ? position : null,
        awardedAt: badge.awarded_at,
        recipientNumber: badge.recipient_number,
        fallback: badge,
      });
    }
    return Array.from(map.values());
  }, [badges, effectiveDefs]);

  // Duplicate the list for the seamless -50% translate loop.
  const track = useMemo(() => (chips.length > 0 ? [...chips, ...chips] : []), [chips]);

  async function openDetail(chip: Chip) {
    let defs = effectiveDefs;
    if (!defs) {
      try {
        const { data } = await getSupabase()
          .from("badge_definitions")
          .select("*")
          .eq("enabled", true)
          .order("sort_order");
        if (data && data.length > 0) {
          defs = data as BadgeDefinition[];
          setFetchedDefs(defs);
        }
      } catch {
        defs = null;
      }
    }
    if (defs) {
      try {
        const supabase = getSupabase();
        let id = resolvedOwnerId;
        if (!id && ownerCode) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("id")
            .eq("user_code", ownerCode)
            .maybeSingle();
          id = (profile as { id: string } | null)?.id ?? null;
          if (id) setResolvedOwnerId(id);
        }
        const ranks = id
          ? ((await supabase
              .from("badge_rank_awards")
              .select("badge_key,rank,awarded_at")
              .eq("user_id", id))?.data ?? [])
          : [];
        const rows: MyBadge[] = badges.map((badge) => ({
          badge_key: badge.badge_key,
          recipient_number: badge.recipient_number,
          pinned: badge.pinned,
          awarded_at: badge.awarded_at,
        }));
        const achievements = buildAchievements(defs, rows, ranks as { badge_key: string; rank: number; awarded_at: string }[], null);
        const achievement = achievements.find((item) => item.key === badgeStem(chip.fallback.name));
        if (achievement) {
          setSelectedAchievement(achievement);
          return;
        }
      } catch {
        // fall through to the simple modal
      }
    }
    setSelected(chip);
  }

  if (badges.length === 0) {
    return (
      <div className={cn("rounded-xl p-4", className)} style={style}>
        <EmptyState
          icon={Award}
          title={t("profile.marquee.emptyTitle")}
          description={emptyLabel ?? t("profile.marquee.emptyDescription")}
        />
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl p-3 overflow-hidden", className)} style={style}>
      <div className="group relative">
        <div
          className={cn(
            "flex w-max gap-3 group-hover:[animation-play-state:paused]",
            "animate-[cova-marquee_32s_linear_infinite]",
            "motion-reduce:animate-none motion-reduce:w-full motion-reduce:flex-wrap motion-reduce:justify-center",
          )}
        >
          {track.map((chip, index) => {
            const style2 = chip.rank !== null ? rankStyle(chip.rank) : null;
            const rankText = style2?.text ?? "";
            return (
              <button
                key={`${chip.key}-${index}`}
                type="button"
                onClick={() => void openDetail(chip)}
                aria-haspopup="dialog"
                aria-label={chip.name}
                className={cn(
                  "relative flex w-32 shrink-0 flex-col items-center gap-1 rounded-lg p-2 text-center transition-transform hover:scale-105 focus-visible:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current",
                  "bg-gradient-to-br",
                  style2 ? style2.gradient : chip.gradient,
                )}
              >
                {chip.rank !== null && (
                  <span
                    className={cn(
                      "absolute -top-1.5 -end-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums shadow",
                      "bg-white/90",
                      rankText,
                    )}
                  >
                    {chip.rank}/{RANK_COUNT}
                  </span>
                )}
                {chip.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- badge art is a public storage URL
                  <img src={chip.imageUrl} alt="" className="h-10 w-10 rounded object-cover" />
                ) : chip.rank !== null ? (
                  <Trophy className={cn("h-6 w-6 drop-shadow", rankText)} aria-hidden="true" />
                ) : (
                  <Sparkles className="h-6 w-6" aria-hidden="true" />
                )}
                <span className="line-clamp-2 text-[11px] font-semibold leading-tight" style={textStyle}>
                  {chip.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-2 text-center">
        <button
          type="button"
          onClick={() => setShowAll(true)}
          style={textStyle}
          className="text-xs font-medium underline underline-offset-2 opacity-80 hover:opacity-100"
        >
          {t("profile.marquee.viewAll")}
        </button>
      </div>

      {/* Rich detail: the full eight-rank progression. */}
      <BadgeDetailModal achievement={selectedAchievement} onClose={() => setSelectedAchievement(null)} />

      {/* Fallback detail (definitions unavailable): earned-on + description. */}
      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ""}
        description={t("profile.marquee.earnedOn", {
          date: selected ? new Date(selected.awardedAt).toLocaleDateString() : "",
        })}
      >
        {selected && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br text-white",
                  selected.rank !== null ? rankStyle(selected.rank).gradient : selected.gradient,
                )}
              >
                {selected.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- badge art is a public storage URL
                  <img src={selected.imageUrl} alt="" className="h-full w-full rounded-xl object-cover" />
                ) : (
                  <Sparkles className="h-7 w-7" aria-hidden="true" />
                )}
              </span>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-cova-mute">
                  {t(`gm.rarity.${selected.fallback.rarity}` as Parameters<typeof t>[0])}
                </p>
                {selected.recipientNumber !== null && (
                  <p className="text-xs text-cova-mute">
                    {t("profile.marquee.limitedEdition", { n: selected.recipientNumber })}
                  </p>
                )}
              </div>
            </div>
            <p className="text-sm leading-relaxed">{selected.fallback.description}</p>
          </div>
        )}
      </Modal>

      <Modal
        open={showAll}
        onClose={() => setShowAll(false)}
        title={t("profile.marquee.allTitle")}
        description={t("profile.marquee.allCount", { count: chips.length })}
      >
        <ul className="grid max-h-[60vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
          {chips.map((chip) => {
            const style3 = chip.rank !== null ? rankStyle(chip.rank) : null;
            return (
              <li key={chip.key}>
                <button
                  type="button"
                  onClick={() => {
                    setShowAll(false);
                    void openDetail(chip);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg bg-gradient-to-br p-2 text-start text-white transition-transform hover:scale-[1.02]",
                    style3 ? style3.gradient : chip.gradient,
                  )}
                >
                  {chip.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- badge art is a public storage URL
                    <img src={chip.imageUrl} alt="" className="h-8 w-8 rounded object-cover" />
                  ) : (
                    <Sparkles className="h-5 w-5 shrink-0" aria-hidden="true" />
                  )}
                  <span className="line-clamp-2 text-xs font-semibold leading-tight">{chip.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Modal>
    </div>
  );
}
