import type { Tone } from "@/types";
import { cn, initials } from "@/lib/utils";

const toneClass: Record<Tone, string> = {
  pale: "bg-cova-pale",
  soft: "bg-cova-soft",
  muted: "bg-cova-muted",
};

const sizeClass = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-20 w-20 text-2xl",
} as const;

interface AvatarProps {
  name: string;
  tone?: Tone;
  size?: keyof typeof sizeClass;
  className?: string;
}

export function Avatar({ name, tone = "soft", size = "md", className }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-cova-ink",
        toneClass[tone],
        sizeClass[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
