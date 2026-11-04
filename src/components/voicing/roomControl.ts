"use client";

/**
 * Remote-control input primitives for voice rooms (shared by the mesh and the
 * screen-share overlay). Mirrors the DM-call implementation in src/lib/call.ts:
 * the viewer sends normalized 0..1 coordinates, the host converts them to its
 * own window pixels and injects synthetic events into ITS page — browsers only
 * let a page drive itself, never the OS outside the document.
 */

/** A synthetic click does not focus inputs — do it by hand like a real one. */
function focusIfFocusable(el: Element): void {
  const he = el as HTMLElement;
  if (!he || typeof he.focus !== "function") return;
  if (
    he.tagName === "INPUT" ||
    he.tagName === "TEXTAREA" ||
    he.tagName === "SELECT" ||
    he.tagName === "BUTTON" ||
    he.isContentEditable ||
    he.hasAttribute("tabindex")
  )
    he.focus();
}

export function injectPointer(type: "move" | "down" | "up", x: number, y: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return;
  const el = document.elementFromPoint(x, y);
  if (!el) return;
  if (type === "down") focusIfFocusable(el);
  const init: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
    button: 0,
    buttons: type === "down" ? 1 : 0,
  };
  if (type === "move") {
    el.dispatchEvent(new MouseEvent("mousemove", init));
    return;
  }
  el.dispatchEvent(new MouseEvent(type === "down" ? "mousedown" : "mouseup", init));
  if (type === "up") el.dispatchEvent(new MouseEvent("click", init));
}

export function injectWheel(x: number, y: number, dx: number, dy: number): void {
  const el = document.elementFromPoint(x, y);
  if (!el) return;
  el.dispatchEvent(
    new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      deltaX: dx,
      deltaY: dy,
      deltaMode: 0,
    }),
  );
}

export function injectKey(type: "keydown" | "keyup", key: string): void {
  if (!key || key.length > 32) return;
  const target = (document.activeElement as HTMLElement | null) ?? document.body;
  target.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, cancelable: true }));
  if (type !== "keydown") return;
  // A synthetic keydown never produces characters — write the text directly
  // into the focused element, so remote typing really lands in inputs.
  try {
    if (key.length === 1) document.execCommand("insertText", false, key);
    else if (key === "Backspace") document.execCommand("delete");
  } catch {
    /* nothing editable focused */
  }
}

/* ----------------------- pure round-6 decisions ----------------------- */

/**
 * A peer counts as "sharing a screen" only when their client SIGNALED the
 * share AND a live video stream actually arrived. WebRTC tracks alone are not
 * proof: the pre-created sendrecv video transceivers used to surface stray
 * muted tracks that rendered a ghost "sharing + black screen" for everyone
 * right after joining, even when nobody was sharing at all.
 */
export function visibleSharers(
  shares: Record<string, boolean>,
  videos: Record<string, unknown>,
): string[] {
  return Object.keys(shares).filter((uid) => shares[uid] && !!videos[uid]);
}

export type CtlPanelMode =
  | "host-code"
  | "host-offer"
  | "controlling"
  | "taken"
  | "enter"
  | "idle";

/**
 * What the always-visible remote-control panel shows. The panel exists for
 * EVERYONE at ALL times — the owner sees the code only once they grant
 * control, while every other participant sees the code field from the very
 * start (no button hunting, no conditional appearing).
 */
export function ctlPanelMode(s: {
  sharing: boolean;
  allowed: boolean;
  controlling: string | null;
  remoteCtlBy: string | null;
  sharer: string | null;
}): CtlPanelMode {
  if (s.sharing) return s.allowed ? "host-code" : "host-offer";
  if (s.controlling) return "controlling";
  if (s.sharer && s.remoteCtlBy) return "taken";
  if (s.sharer) return "enter";
  return "idle";
}

export type LatePush = {
  t: "share" | "cam" | "dub";
  on: boolean;
  facing?: "user" | "environment";
  lang?: string;
};

/**
 * Live room state a peer pushes the moment a control channel opens, so late
 * joiners learn who shares a screen, who has the camera on and who is
 * dubbing — none of that may depend on catching an old broadcast.
 */
export function lateJoinPushes(s: {
  sharing: boolean;
  camOn: boolean;
  camFacing: "user" | "environment";
  dubOn: boolean;
  dubLang: string;
}): LatePush[] {
  const out: LatePush[] = [];
  if (s.sharing) out.push({ t: "share", on: true });
  if (s.camOn) out.push({ t: "cam", on: true, facing: s.camFacing });
  if (s.dubOn) out.push({ t: "dub", on: true, lang: s.dubLang });
  return out;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Maps a pointer event on the letterboxed video to 0..1 screen coordinates. */
export function normalizedVideoPoint(
  el: HTMLVideoElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  const vw = el.videoWidth || 16;
  const vh = el.videoHeight || 9;
  const scale = Math.min(rect.width / vw, rect.height / vh); // object-contain
  const dispW = vw * scale;
  const dispH = vh * scale;
  const offX = (rect.width - dispW) / 2;
  const offY = (rect.height - dispH) / 2;
  return {
    x: clamp01((clientX - rect.left - offX) / dispW),
    y: clamp01((clientY - rect.top - offY) / dispH),
  };
}

/**
 * Pure decision for a control-code verification, used by the voice mesh and
 * covered by scripts/test-dubbing-logic.ts. Exclusive on purpose: exactly ONE
 * controller may hold the screen — a second correct code is rejected with
 * "busy" while someone is already controlling, and a code sent before the
 * sharer enabled control is rejected with "off" (never "wrong", so the viewer
 * is not told their code is bad when the feature is simply off).
 */
export function ctlVerifyDecision(
  cur: { allowed: boolean; code: string | null; controlledBy: string | null },
  uid: string,
  code: unknown,
): "grant" | "busy" | "off" | "wrong" {
  if (!cur.allowed || !cur.code) return "off";
  if (cur.controlledBy && cur.controlledBy !== uid) return "busy";
  return String(code ?? "") === cur.code ? "grant" : "wrong";
}
