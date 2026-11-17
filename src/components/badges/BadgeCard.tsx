"use client";

import { Lock, Pin, PinOff, Trophy } from "lucide-react";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useS } from "@/i18n/spaces";
import { cn } from "@/lib/utils";
import { rankName, rankStyle, rarityStyle, RANK_COUNT } from "@/lib/badge-ranks";
import type { Achievement } from "@/lib/badge-collection";

export interface BadgeCardProps {
  achievement: Achievement;
  onOpen: (achievement: Achievement) => void;
  /** Pinning is only offered on the signed-in member's own collection. */
  pinnable?: boolean;
  pinned?: boolean;
  onTogglePin?: (achievement: Achievement) => void;
}

/**
 * The evolving badge card: ONE card per achievement, showing only the latest
 * achieved rank. Clicking opens the full eight-rank progression view.
 */
export function BadgeCard({ achievement, onOpen, pinnable = false, pinned = false, onTogglePin }: BadgeCardProps) {
  const t = useS();
  const unlocked = achievement.currentRank !== null;
  const style = rankStyle(achievement.currentRank ?? 1);
  const rarity = rarityStyle(achievement.rarity);

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => onOpen(achievement)}
        aria-haspopup="dialog"
        className={cn(
          "group flex w-full flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-transform",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cova-ink",
          unlocked ? "border-cova-line bg-white hover:scale-[1.02]" : "border-cova-line bg-cova-bg opacity-70 grayscale",
        )}
      >
        <span className="relative">
          <span
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-full shadow-inner",
              unlocked ? cn("bg-gradient-to-br", style.gradient) : "bg-cova-pale text-cova-mute",
            )}
            aria-hidden="true"
          >
            {unlocked ? (
              <Trophy className={cn("h-6 w-6 drop-shadow", unlocked ? style.text : "")} />
            ) : (
              <Lock className="h-5 w-5" />
            )}
          </span>
          {unlocked && achievement.currentRank !== null && achievement.currentRank > 1 && (
            <span
              className={cn(
                "absolute -bottom-1 -end-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums shadow",
                "bg-gradient-to-br",
                style.gradient,
                style.text,
              )}
            >
              {achievement.currentRank}/{RANK_COUNT}
            </span>
          )}
        </span>

        <span className="line-clamp-1 text-sm font-semibold text-cova-ink">{achievement.name}</span>

        {unlocked ? (
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", style.chip)}>
            {t("gm.card.rank", {
              rank: achievement.currentRank ?? 1,
              name: rankName(achievement.currentRank ?? 1),
            })}
          </span>
        ) : (
          <span className="rounded-full bg-cova-pale px-2 py-0.5 text-[10px] font-medium text-cova-mute">
            {t("gm.filter.locked")}
          </span>
        )}

        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", rarity.chip)}>
          {t(`gm.rarity.${achievement.rarity}` as never)}
        </span>

        {achievement.limited && achievement.tiers.some((tier) => tier.recipientNumber) && (
          <span className="text-[10px] font-medium text-cova-mute">
            {t("gm.detail.recipient", {
              n: achievement.tiers.find((tier) => tier.recipientNumber)?.recipientNumber ?? 0,
            })}
          </span>
        )}

        {achievement.next && achievement.progressValue !== null ? (
          <div className="w-full pt-0.5">
            <ProgressBar
              value={achievement.progressValue}
              max={achievement.progressTarget ?? 1}
              label={achievement.name}
              className="h-1.5"
            />
            <span className="mt-0.5 block text-[10px] text-cova-mute">
              {t("gm.card.next", { rank: rankName(achievement.next.position), threshold: achievement.next.threshold })}
            </span>
          </div>
        ) : achievement.next ? (
          <span className="text-[10px] text-cova-mute">
            {t("gm.card.next", { rank: rankName(achievement.next.position), threshold: achievement.next.threshold })}
          </span>
        ) : unlocked ? (
          <span className="text-[10px] font-medium text-cova-mute">{t("gm.detail.completed")}</span>
        ) : null}

        <span className="text-[10px] text-cova-mute">
          {achievement.next
            ? t("gm.card.nextXp", { xp: achievement.next.xp })
            : unlocked
              ? t("gm.card.earnedXp", { xp: achievement.tiers.filter((tier) => tier.achieved).reduce((sum, tier) => sum + tier.xp, 0) })
              : t("gm.card.earnedXp", { xp: achievement.tiers[0]?.xp ?? 0 })}
        </span>
      </button>

      {pinnable && unlocked && onTogglePin && (
        <button
          type="button"
          onClick={() => onTogglePin(achievement)}
          aria-pressed={pinned}
          className={cn(
            "flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border text-xs font-medium transition-colors",
            pinned
              ? "border-cova-ink bg-cova-ink text-white"
              : "border-cova-line bg-white text-cova-mute hover:bg-cova-pale hover:text-cova-ink",
          )}
        >
          {pinned ? <Pin className="h-3.5 w-3.5" aria-hidden="true" /> : <PinOff className="h-3.5 w-3.5" aria-hidden="true" />}
          {pinned ? t("gm.unpin") : t("gm.pin")}
        </button>
      )}
    </div>
  );
}
