"use client";

import { Check, Lock, Trophy } from "lucide-react";
import { motion } from "motion/react";
import { Modal } from "@/components/ui/Modal";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useS } from "@/i18n/spaces";
import { cn } from "@/lib/utils";
import { layoutTransition } from "@/lib/motion";
import { rankName, rankStyle, rarityStyle, RANK_COUNT } from "@/lib/badge-ranks";
import type { Achievement, BadgeTier } from "@/lib/badge-collection";

export interface BadgeDetailModalProps {
  achievement: Achievement | null;
  onClose: () => void;
}

/**
 * The full eight-rank progression of one achievement: current rank hero,
 * live stat, progress toward the next rank, the complete trophy path with
 * unlocked/locked states, XP per milestone and the evolution history.
 */
export function BadgeDetailModal({ achievement, onClose }: BadgeDetailModalProps) {
  const t = useS();
  if (!achievement) return null;

  const unlocked = achievement.currentRank !== null;
  const currentStyle = rankStyle(achievement.currentRank ?? 1);
  const next = achievement.next;
  const achievedTiers = achievement.tiers.filter((tier) => tier.achieved);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={achievement.name}
      description={achievement.description}
    >
      <div className="space-y-5">
        {/* Hero: current appearance + rank + stat */}
        <div className="flex flex-col items-center gap-4 rounded-xl border border-cova-line bg-cova-bg p-4 sm:flex-row sm:items-center">
          {/* Same layoutId as the card circle: the trophy morphs from the
              grid card into this hero on open. */}
          <motion.span
            layoutId={`badge-trophy-${achievement.key}`}
            transition={layoutTransition}
            className={cn(
              "cova-badge-shine flex h-20 w-20 shrink-0 items-center justify-center rounded-full shadow-lg",
              unlocked ? cn("bg-gradient-to-br", currentStyle.gradient) : "bg-cova-pale text-cova-mute grayscale",
            )}
            aria-hidden="true"
          >
            {unlocked ? <Trophy className={cn("h-9 w-9 drop-shadow", currentStyle.text)} /> : <Lock className="h-8 w-8" />}
          </motion.span>
          <div className="min-w-0 flex-1 text-center sm:text-start">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-bold",
                  unlocked ? currentStyle.chip : "bg-cova-pale text-cova-mute",
                )}
              >
                {unlocked
                  ? t("gm.card.rank", {
                      rank: achievement.currentRank ?? 1,
                      name: rankName(achievement.currentRank ?? 1),
                    })
                  : t("gm.filter.locked")}
              </span>
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", rarityStyle(achievement.rarity).chip)}>
                {t(`gm.rarity.${achievement.rarity}` as never)}
              </span>
              <span className="rounded-full bg-cova-pale px-2.5 py-1 text-xs font-medium text-cova-mute">
                {t(`gm.category.${achievement.category}` as never)}
              </span>
            </div>
            <p className="mt-2 text-sm font-semibold text-cova-ink">
              {t("gm.detail.stat", {
                value: achievement.metricValue?.toLocaleString() ?? "—",
                metric: t(`gm.metric.${achievement.metric}` as never),
              })}
            </p>
            {next && (
              <p className="mt-0.5 text-xs text-cova-mute">
                {t("gm.detail.nextRequirement", {
                  rank: rankName(next.position),
                  threshold: next.threshold.toLocaleString(),
                  xp: next.xp,
                })}
              </p>
            )}
          </div>
        </div>

        {/* Progress toward the next rank */}
        {next ? (
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium text-cova-ink">
                {t("gm.detail.progress", { rank: rankName(next.position) })}
              </span>
              <span className="tabular-nums text-cova-mute">
                {achievement.progressValue !== null
                  ? `${achievement.progressValue.toLocaleString()} / ${next.threshold.toLocaleString()}`
                  : t("gm.detail.progressHidden")}
              </span>
            </div>
            <ProgressBar
              value={achievement.progressValue ?? 0}
              max={next.threshold}
              label={t("gm.detail.progress", { rank: rankName(next.position) })}
              className="h-2.5"
            />
          </div>
        ) : (
          unlocked && (
            <p className="flex items-center justify-center gap-2 rounded-xl bg-cova-pale px-4 py-3 text-sm font-medium text-cova-ink">
              <Check className="h-4 w-4" aria-hidden="true" />
              {t("gm.detail.completed")}
            </p>
          )
        )}

        {/* Complete progression path */}
        <section aria-label={t("gm.detail.path")}>
          <h3 className="mb-2 text-sm font-semibold text-cova-ink">{t("gm.detail.path")}</h3>
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {achievement.tiers.map((tier) => (
              <PathStep key={`${tier.definitionKey}-${tier.position}`} tier={tier} achievement={achievement} />
            ))}
          </ol>
          {achievement.tiers.length < RANK_COUNT && (
            <p className="mt-2 text-xs text-cova-mute">{t("gm.detail.partialLadder")}</p>
          )}
        </section>

        {/* Evolution history */}
        {achievedTiers.some((tier) => tier.awardedAt) && (
          <section aria-label={t("gm.detail.history")}>
            <h3 className="mb-2 text-sm font-semibold text-cova-ink">{t("gm.detail.history")}</h3>
            <ul className="divide-y divide-cova-line rounded-xl border border-cova-line">
              {achievedTiers
                .filter((tier) => tier.awardedAt)
                .map((tier) => (
                  <li key={`history-${tier.definitionKey}-${tier.position}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br",
                        rankStyle(tier.position).gradient,
                      )}
                      aria-hidden="true"
                    >
                      <Trophy className={cn("h-3.5 w-3.5", rankStyle(tier.position).text)} />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-cova-ink">{tier.label}</span>
                    {tier.recipientNumber && (
                      <span className="shrink-0 text-xs text-cova-mute">
                        {t("gm.detail.recipient", { n: tier.recipientNumber })}
                      </span>
                    )}
                    <span className="shrink-0 text-xs text-cova-mute">
                      {new Date(tier.awardedAt as string).toLocaleDateString()}
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
}

function PathStep({ tier, achievement }: { tier: BadgeTier; achievement: Achievement }) {
  const t = useS();
  const style = rankStyle(tier.position);
  const isCurrent = achievement.currentRank === tier.position;

  return (
    <li
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl border p-3 text-center",
        tier.achieved ? "border-cova-line bg-white" : "border-cova-line bg-cova-bg opacity-70",
      )}
    >
      <span className="relative">
        <span
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full shadow-inner",
            tier.achieved ? cn("bg-gradient-to-br", style.gradient) : "bg-cova-pale text-cova-mute",
            !tier.achieved && "grayscale",
            isCurrent && cn("ring-2 ring-offset-2", style.ring),
          )}
          aria-hidden="true"
        >
          {tier.achieved ? (
            <Trophy className={cn("h-5 w-5", style.text)} />
          ) : (
            <Lock className="h-4 w-4" />
          )}
        </span>
        {tier.achieved && (
          <span
            className={cn(
              "absolute -bottom-1 -end-1 flex h-4 w-4 items-center justify-center rounded-full bg-cova-ink text-white",
            )}
            aria-hidden="true"
          >
            <Check className="h-2.5 w-2.5" />
          </span>
        )}
      </span>
      <span className="text-xs font-semibold text-cova-ink">{tier.label}</span>
      <span className="text-[10px] tabular-nums text-cova-mute">
        {tier.threshold.toLocaleString()} {t(`gm.metric.${achievement.metric}` as never)}
      </span>
      <span className="text-[10px] font-medium text-cova-mute">+{tier.xp} XP</span>
      <span className={cn("text-[10px] font-medium", tier.achieved ? "text-cova-ink" : "text-cova-mute")}>
        {tier.achieved ? t("gm.detail.unlocked") : t("gm.filter.locked")}
      </span>
      {isCurrent && (
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", style.chip)}>{t("gm.detail.current")}</span>
      )}
    </li>
  );
}
