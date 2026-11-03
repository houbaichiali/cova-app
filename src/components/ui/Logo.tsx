import Link from "next/link";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  showTagline?: boolean;
  href?: string;
  /** Renders only the SVG mark (icon rails, compact headers). */
  markOnly?: boolean;
}

/** Reusable COVA wordmark. Pure SVG + text, no image assets required. */
export function Logo({ className, showTagline = false, href = "/", markOnly = false }: LogoProps) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-2.5", className)}
      aria-label="COVA home"
    >
      <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="9" fill="#DCECF7" />
        <path
          d="M6 22 L16 8 L26 22"
          fill="none"
          stroke="#6F9FBA"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M11 22 L16 15 L21 22"
          fill="none"
          stroke="#243447"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {!markOnly && (
        <span className="flex flex-col leading-none">
          <span className="text-lg font-semibold tracking-[0.18em] text-cova-ink">COVA</span>
          {showTagline && (
            <span className="mt-1 text-[11px] font-medium text-cova-mute">
              Community Of Visionary Achievers
            </span>
          )}
        </span>
      )}
    </Link>
  );
}
