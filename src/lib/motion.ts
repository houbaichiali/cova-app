import type { Variants } from "motion/react";

/**
 * Shared motion vocabulary — "Balanced & Premium": animations are visible but
 * elegant, never decorative. Every component animates with these tokens so
 * the app feels like one continuous system.
 */

/** Fast start, silky settle (the spec's reference ease). */
export const EASE_PREMIUM = [0.22, 1, 0.36, 1] as const;

export const DURATION = { quick: 0.2, base: 0.3, slow: 0.45 } as const;

/** Standard entrance: subtle 12px rise + fade. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE_PREMIUM } },
};

/** Parent variants for staggered list entrances (spec baseline: 0.08s). */
export function makeStagger(stagger = 0.08, delayChildren = 0.04): Variants {
  return {
    hidden: {},
    visible: { transition: { staggerChildren: stagger, delayChildren } },
  };
}

/** Layout transition for spatial-continuity (shared-element) moves. */
export const layoutTransition = { layout: { duration: 0.35, ease: EASE_PREMIUM } } as const;
