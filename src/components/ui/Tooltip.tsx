"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Accessible contextual tooltip (WAI-ARIA-inspired): shown on hover and on
 * keyboard focus of its content, never permanently in the layout. Rendered
 * through a portal at a fixed position so sidebars with hidden overflow
 * (collapsed rails, scrollable navs) can never clip it. The wrapper also
 * carries a native `title` fallback, which touch users and screen readers
 * announce on the focused element. React focus events bubble, so one set of
 * handlers on the wrapper covers every focusable child.
 */
export function Tooltip({
  label,
  children,
  className,
}: {
  label: string;
  /** The trigger content (link, button…). */
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number; rtl: boolean } | null>(null);

  const show = useCallback(() => {
    const el = wrapperRef.current;
    if (!el || typeof window === "undefined") return;
    const rect = el.getBoundingClientRect();
    setAnchor({
      top: Math.max(8, Math.min(rect.top, window.innerHeight - 140)),
      left: rect.right,
      rtl: document.documentElement.dir === "rtl",
    });
  }, []);

  const hide = useCallback(() => setAnchor(null), []);

  useEffect(() => {
    if (!anchor) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anchor, hide]);

  return (
    <>
      <span
        ref={wrapperRef}
        title={label}
        aria-describedby={anchor ? id : undefined}
        className={cn("inline-flex min-w-0", className)}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {anchor &&
        createPortal(
          <span
            role="tooltip"
            id={id}
            className={
              "pointer-events-none fixed z-[80] w-72 rounded-lg border border-admin-navy-line bg-admin-navy px-3 py-2 " +
              "text-xs leading-relaxed text-slate-200 shadow-lg"
            }
            style={
              anchor.rtl
                ? { top: anchor.top, left: anchor.left - 8, transform: "translateX(-100%)" }
                : { top: anchor.top, left: anchor.left + 8 }
            }
          >
            {label}
          </span>,
          document.body,
        )}
    </>
  );
}
