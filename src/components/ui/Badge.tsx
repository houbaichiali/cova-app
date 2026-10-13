import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type BadgeTone = "pale" | "soft" | "outline";

const tones: Record<BadgeTone, string> = {
  pale: "bg-cova-pale text-cova-ink",
  soft: "bg-cova-soft text-cova-ink",
  outline: "border border-cova-line bg-white text-cova-mute",
};

export function Badge({
  tone = "pale",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
