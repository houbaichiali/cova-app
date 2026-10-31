"use client";

import { useEffect, useRef, useState } from "react";

type Phase = "idle" | "busy" | "done";

interface DownloadButtonProps {
  /** Direct signed URL, used for both the download and the "Open" action. */
  url?: string | null;
  /** Fetches a fresh signed URL at click time (takes precedence over url). */
  getUrl?: () => Promise<string | null>;
  /** URL the "Open" action uses when it differs from the download URL. */
  openUrl?: string | null;
  label: string;
  openLabel: string;
}

interface PhaseState {
  phase: Phase;
  /** The url the phase belongs to; a different url always reads as "idle". */
  forUrl: string | null;
}

/**
 * Animated download pill (design from Uiverse.io by nazar-gavrylyk): the click
 * starts the real download and plays a short "installing" animation, then the
 * pill turns into a green "Open" button for the file.
 */
export function DownloadButton({ url, getUrl, openUrl, label, openLabel }: DownloadButtonProps) {
  const [state, setState] = useState<PhaseState>({ phase: "idle", forUrl: null });
  const resolvedRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);

  // Derived: when a new signed URL arrives, the pill is back to "Download".
  const currentUrl = url ?? null;
  const phase: Phase = state.forUrl === currentUrl ? state.phase : "idle";
  const setPhase = (next: Phase) => setState({ phase: next, forUrl: currentUrl });

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const active = Boolean(url || getUrl);

  async function start() {
    if (phase !== "idle") return;
    let target = url ?? null;
    if (getUrl) {
      try {
        target = await getUrl();
      } catch {
        target = null;
      }
    }
    if (!target) return;
    resolvedRef.current = target;
    const link = document.createElement("a");
    link.href = target;
    link.download = "";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setPhase("busy");
    timerRef.current = window.setTimeout(() => setPhase("done"), 3500);
  }

  function open() {
    const target = openUrl ?? resolvedRef.current ?? url;
    if (target) window.open(target, "_blank", "noopener");
    setPhase("idle");
  }

  return (
    <button
      type="button"
      className={`dlb ${phase}`}
      disabled={!active || phase === "busy"}
      onClick={() => {
        if (phase === "done") open();
        else void start();
      }}
    >
      <span className="dlb__circle" aria-hidden="true">
        <svg
          className="dlb__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 19V5m0 14-4-4m4 4 4-4" />
        </svg>
        <span className="dlb__square" />
      </span>
      <span className="dlb__title">{phase === "done" ? openLabel : label}</span>
    </button>
  );
}
