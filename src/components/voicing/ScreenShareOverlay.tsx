"use client";

import { useEffect, useRef, useState } from "react";
import { MonitorUp, MousePointerClick } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { useS } from "@/i18n/spaces";
import {
  ctlPanelMode,
  normalizedVideoPoint,
  visibleSharers,
} from "@/components/voicing/roomControl";
import type { RoomVoiceCtl, RoomVoiceCtlActions } from "@/components/voicing/useVoiceMesh";
import { cn } from "@/lib/utils";

/**
 * Screen-share area for voice rooms, round 6:
 *
 * - The remote-control panel is PERSISTENT: it exists for every participant
 *   from the moment they join. Everyone sees the code field by default; the
 *   moment the screen owner grants control (Remote button), their panel
 *   switches to showing the 6-digit code to hand out.
 * - The shared-screen video renders ONLY for peers whose client signaled a
 *   share AND whose live stream arrived — a stray WebRTC track alone never
 *   draws the card again (that was the ghost "sharing + black screen").
 * - While controlling, pointer/keyboard events on the video are forwarded as
 *   normalized coordinates to the sharer, who injects them into their page.
 */
export function ScreenShareOverlay({
  members,
  remoteVideos,
  remoteShares,
  myScreen,
  sharing,
  ctl,
  ctlActions,
}: {
  /** uid -> name, for badges. */
  members: Record<string, string>;
  remoteVideos: Record<string, MediaStream>;
  /** uid -> true for peers whose client signals an active screen share. */
  remoteShares: Record<string, boolean>;
  /** My own screen while I share (local preview). */
  myScreen: MediaStream | null;
  /** I am sharing right now. */
  sharing: boolean;
  ctl: RoomVoiceCtl;
  ctlActions: RoomVoiceCtlActions;
}) {
  const t = useS();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [codeDraft, setCodeDraft] = useState("");
  const [idleNote, setIdleNote] = useState(false);
  const lastMoveRef = useRef(0);

  /** Signaled sharers with a live stream — never a bare track (ghost fix). */
  const sharerUids = visibleSharers(remoteShares, remoteVideos);
  const first = sharerUids[0] ?? null;
  /** Remote share if one exists, otherwise my own while I share. */
  const showingMine = !first && sharing;
  const stream = first ? remoteVideos[first] : showingMine ? myScreen : null;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream ?? null;
    if (stream) void el.play().catch(() => undefined);
  }, [stream]);

  useEffect(() => {
    if (!ctl.notice) return;
    const id = window.setTimeout(() => ctlActions.clearNotice(), 4000);
    return () => window.clearTimeout(id);
  }, [ctl.notice, ctlActions]);

  useEffect(() => {
    if (!idleNote) return;
    const id = window.setTimeout(() => setIdleNote(false), 4000);
    return () => window.clearTimeout(id);
  }, [idleNote]);

  const mode = ctlPanelMode({
    sharing,
    allowed: ctl.allowed,
    controlling: ctl.controlling,
    remoteCtlBy: ctl.remoteCtlBy,
    sharer: first,
  });

  /** Null-safe: notices can render with no active sharer at all. */
  const nameOf = (uid: string | null) => (uid ? members[uid] ?? uid.slice(0, 8) : "?");

  // Viewer-side capture: gestures on the video become control messages.
  const captureProps =
    mode === "controlling" && stream
      ? {
          tabIndex: 0,
          onPointerMove: (e: React.PointerEvent) => {
            const el = videoRef.current;
            if (!el) return;
            const now = Date.now();
            if (now - lastMoveRef.current < 33) return; // ~30 events/s
            lastMoveRef.current = now;
            const p = normalizedVideoPoint(el, e.clientX, e.clientY);
            ctlActions.pointer(p.x, p.y);
          },
          onPointerDown: (e: React.PointerEvent) => {
            const el = videoRef.current;
            if (!el) return;
            const p = normalizedVideoPoint(el, e.clientX, e.clientY);
            ctlActions.down(p.x, p.y);
          },
          onPointerUp: (e: React.PointerEvent) => {
            const el = videoRef.current;
            if (!el) return;
            const p = normalizedVideoPoint(el, e.clientX, e.clientY);
            ctlActions.up(p.x, p.y);
          },
          onWheel: (e: React.WheelEvent) => {
            const el = videoRef.current;
            if (!el) return;
            const p = normalizedVideoPoint(el, e.clientX, e.clientY);
            ctlActions.wheel(p.x, p.y, e.deltaX, e.deltaY);
          },
          onKeyDown: (e: React.KeyboardEvent) => ctlActions.key("kd", e.key),
          onKeyUp: (e: React.KeyboardEvent) => ctlActions.key("ku", e.key),
        }
      : {};

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!first) {
      setIdleNote(true); // nobody shares yet — the field still exists for later
      return;
    }
    ctlActions.requestControl(first);
    ctlActions.submitCode(codeDraft, first);
  };

  return (
    <Card data-testid="remote-panel">
      <CardBody className="space-y-2.5">
        {/* ---------- persistent remote-control panel (always visible) ---------- */}
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-blue-900">
            <MousePointerClick className="h-4 w-4 text-blue-600" aria-hidden="true" />
            {t("room.remote")}
          </h3>
          {sharing && <Badge tone="soft">{t("room.sharingYou")}</Badge>}
          {first && !sharing && <Badge tone="soft">{t("room.sharingBy", { name: nameOf(first) })}</Badge>}
          {sharing && ctl.controlledBy && (
            <Badge tone="soft">{t("room.ctlBy", { name: nameOf(ctl.controlledBy) })}</Badge>
          )}
          <span className="ms-auto flex items-center gap-1.5">
            {mode === "host-offer" && (
              <Button
                size="sm"
                onClick={ctlActions.enableControl}
                className="border-blue-300 bg-blue-600 text-white hover:bg-blue-700"
              >
                <MousePointerClick className="h-3.5 w-3.5" aria-hidden="true" />
                {t("room.ctlAllow")}
              </Button>
            )}
            {mode === "host-code" && (
              <Button size="sm" variant="danger" onClick={ctlActions.disableControl}>
                {t("room.ctlStop")}
              </Button>
            )}
          </span>
        </div>

        {/* Host: the moment control is granted, the field becomes the code. */}
        {mode === "host-code" && ctl.code && (
          <div
            className="flex flex-wrap items-center justify-center gap-3 rounded-xl border-2 border-blue-300 bg-blue-50 px-3 py-2.5"
            data-testid="ctl-code"
          >
            <span className="text-sm font-semibold text-blue-900">{t("room.ctlCode")}</span>
            <span className="font-mono text-3xl font-bold tracking-[0.35em] text-blue-700">
              {ctl.code}
            </span>
            <span className="text-[11px] text-blue-700">{t("room.ctlCodeHint")}</span>
          </div>
        )}
        {mode === "host-offer" && (
          <p className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-blue-800">
            {t("room.ctlOfferHint")}
          </p>
        )}

        {/* Everyone else: the code field exists from the very start. */}
        {(mode === "enter" || mode === "idle") && (
          <form
            className="rounded-xl border-2 border-blue-200 bg-blue-50/60 p-3"
            data-testid="ctl-code-form"
            onSubmit={submit}
          >
            <p className="flex items-center gap-2 text-sm font-bold text-blue-900">
              <MousePointerClick className="h-4 w-4 text-blue-600" aria-hidden="true" />
              {t("room.ctlEnterTitle")}
            </p>
            {mode === "enter" && (
              <p className="mt-0.5 text-xs text-blue-800">
                {ctl.remoteAllowed
                  ? t("room.ctlWatch", { name: nameOf(first) })
                  : t("room.ctlOff")}
              </p>
            )}
            <div className="mt-2 flex items-center gap-2">
              <input
                value={codeDraft}
                onChange={(e) => setCodeDraft(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="off"
                aria-label={t("room.ctlEnterTitle")}
                className="h-11 min-w-0 flex-1 rounded-lg border-2 border-blue-300 bg-white px-3 text-center font-mono text-xl font-bold tracking-[0.4em] text-blue-900 focus:border-blue-500 focus:outline-none"
                placeholder="123456"
              />
              <Button
                type="submit"
                size="lg"
                className="shrink-0 border-blue-300 bg-blue-600 text-white hover:bg-blue-700"
              >
                {t("room.send")}
              </Button>
            </div>
            {mode === "idle" && (
              <p className={cn("mt-2 text-[11px]", idleNote ? "font-semibold text-blue-900" : "text-blue-700")}>
                {t("room.ctlIdle")}
              </p>
            )}
          </form>
        )}

        {/* Exclusive: someone else already holds the control. */}
        {mode === "taken" && (
          <p
            className="rounded-xl border-2 border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900"
            role="status"
          >
            {t("room.ctlHeldBy", { name: nameOf(ctl.remoteCtlBy) })}
          </p>
        )}
        {mode === "controlling" && (
          <p className="text-sm font-semibold text-blue-800" role="status">
            {t("room.ctlActive", { name: nameOf(ctl.controlling) })}
          </p>
        )}

        {ctl.notice && (
          <p className="rounded-lg bg-cova-pale px-3 py-2 text-xs" role="status">
            {t(ctl.notice as Parameters<typeof t>[0])}
          </p>
        )}

        <p className="text-[11px] leading-snug text-cova-mute">{t("room.ctlScope")}</p>

        {/* ---------- the shared screen itself (only when really shared) ---------- */}
        {stream && (
          <div
            className={cn(
              "overflow-hidden rounded-xl border-2 bg-black",
              mode === "controlling" ? "border-red-500" : "border-blue-200",
            )}
          >
            <p className="flex items-center gap-2 bg-cova-ink px-3 py-1.5 text-xs font-medium text-white">
              <MonitorUp className="h-3.5 w-3.5" aria-hidden="true" />
              {showingMine ? t("room.sharingYou") : t("room.sharingBy", { name: nameOf(first) })}
              {mode === "controlling" && (
                <span className="ms-auto rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                  {t("room.remote")}
                </span>
              )}
            </p>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={cn(
                "aspect-video w-full object-contain outline-none",
                mode === "controlling" && "cursor-none",
              )}
              {...captureProps}
            />
          </div>
        )}
      </CardBody>
    </Card>
  );
}
