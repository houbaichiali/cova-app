"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Award, Sparkles } from "lucide-react";

import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import type { EarnedBadge } from "@/lib/profile-data";

/**
 * Infinite horizontal badge marquee over EARNED badges only.
 *  - seamless loop (the track is rendered twice)
 *  - pauses on hover
 *  - honors prefers-reduced-motion (static wrapped grid instead)
 *  - click a badge for its details
 *  - honest empty state when nothing has been earned
 */

const RARITY_GRADIENT: Record<string, string> = {
  common: "from-amber-200 to-amber-500",
  uncommon: "from-slate-200 to-slate-400",
  rare: "from-yellow-200 to-yellow-500",
  epic: "from-indigo-200 to-indigo-500",
  legendary: "from-neutral-800 via-yellow-600 to-neutral-800",
};

export interface BadgeMarqueeProps {
  badges: EarnedBadge[];
  /** Background/border come from the appearance editor; text color for contrast. */
  className?: string;
  style?: CSSProperties;
  textStyle?: CSSProperties;
  emptyLabel?: string;
}

export function BadgeMarquee({ badges, className, style, textStyle, emptyLabel }: BadgeMarqueeProps) {
  const t = useT();
  const [selected, setSelected] = useState<EarnedBadge | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Duplicate the list for the seamless -50% translate loop.
  const track = useMemo(() => (badges.length > 0 ? [...badges, ...badges] : []), [badges]);

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
          {track.map((badge, index) => (
            <button
              key={`${badge.badge_key}-${index}`}
              type="button"
              onClick={() => setSelected(badge)}
              aria-label={badge.name}
              className={cn(
                "flex w-32 shrink-0 flex-col items-center gap-1 rounded-lg p-2 text-center transition-transform hover:scale-105 focus-visible:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current",
                "bg-gradient-to-br",
                RARITY_GRADIENT[badge.rarity] ?? RARITY_GRADIENT.common,
              )}
            >
              {badge.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- badge art is a public storage URL
                <img src={badge.image_url} alt="" className="h-10 w-10 rounded object-cover" />
              ) : (
                <Sparkles className="h-6 w-6" aria-hidden="true" />
              )}
              <span className="line-clamp-2 text-[11px] font-semibold leading-tight" style={textStyle}>{badge.name}</span>
            </button>
          ))}
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

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ""}
        description={t("profile.marquee.earnedOn", {
          date: selected ? new Date(selected.awarded_at).toLocaleDateString() : "",
        })}
      >
        {selected && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br text-white",
                  RARITY_GRADIENT[selected.rarity] ?? RARITY_GRADIENT.common,
                )}
              >
                {selected.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- badge art is a public storage URL
                  <img src={selected.image_url} alt="" className="h-full w-full rounded-xl object-cover" />
                ) : (
                  <Sparkles className="h-7 w-7" aria-hidden="true" />
                )}
              </span>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-cova-mute">
                  {t(`gm.rarity.${selected.rarity}` as Parameters<typeof t>[0])}
                </p>
                {selected.recipient_number !== null && (
                  <p className="text-xs text-cova-mute">
                    {t("profile.marquee.limitedEdition", { n: selected.recipient_number })}
                  </p>
                )}
              </div>
            </div>
            <p className="text-sm leading-relaxed">{selected.description}</p>
          </div>
        )}
      </Modal>

      <Modal
        open={showAll}
        onClose={() => setShowAll(false)}
        title={t("profile.marquee.allTitle")}
        description={t("profile.marquee.allCount", { count: badges.length })}
      >
        <ul className="grid max-h-[60vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
          {badges.map((badge) => (
            <li key={badge.badge_key}>
              <button
                type="button"
                onClick={() => {
                  setShowAll(false);
                  setSelected(badge);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg bg-gradient-to-br p-2 text-start text-white transition-transform hover:scale-[1.02]",
                  RARITY_GRADIENT[badge.rarity] ?? RARITY_GRADIENT.common,
                )}
              >
                {badge.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- badge art is a public storage URL
                  <img src={badge.image_url} alt="" className="h-8 w-8 rounded object-cover" />
                ) : (
                  <Sparkles className="h-5 w-5 shrink-0" aria-hidden="true" />
                )}
                <span className="line-clamp-2 text-xs font-semibold leading-tight">{badge.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
