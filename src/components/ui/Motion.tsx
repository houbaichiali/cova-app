"use client";

import { motion, MotionConfig, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { fadeUp, makeStagger } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Global motion policy: `reducedMotion="user"` honors prefers-reduced-motion
 * for every motion animation in the app (transforms are skipped, opacity kept),
 * completing the global CSS rule that flattens CSS keyframes.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/**
 * Staggered entrance container for card lists. Children wrap their items in
 * `StaggerItem`; only newly mounted items animate — already-rendered items
 * keep their state and never replay (stable list keys required).
 */
export function StaggerGroup({
  children,
  className,
  stagger = 0.08,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
}) {
  return (
    <motion.div
      variants={makeStagger(stagger)}
      initial="hidden"
      animate="visible"
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** One staggered list item (fade + rise). */
export function StaggerItem({
  children,
  className,
  variants = fadeUp,
}: {
  children: ReactNode;
  className?: string;
  variants?: Variants;
}) {
  return (
    <motion.div variants={variants} className={cn("min-w-0", className)}>
      {children}
    </motion.div>
  );
}
