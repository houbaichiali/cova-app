"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Signal } from "@/lib/spaces-client";
import { resolveRestoreVolume } from "./dubModel";
import {
  ctlVerifyDecision,
  injectKey,
  injectPointer,
  injectWheel,
  lateJoinPushes,
} from "./roomControl";

/**
 * Full-mesh WebRTC audio for voice rooms, hardened for cross-device calls:
 *
 * - DETERMINISTIC negotiation (the larger uid offers once with placeholder
 *   senders on audio/screen/camera m-lines; the answerer fills them with
 *   addTrack) — perfect negotiation deadlocked real browsers.
 * - ICE servers come from /api/ice (env-configurable TURN) because the old
 *   hardcoded openrelay TURN service is dead — cross-network calls had NO
 *   relay at all and stayed silent forever.
 * - ICE-RESTART recovery: if a connection fails or stays disconnected, the
 *   offerer re-offers with iceRestart automatically (offerer only, so there
 *   is never a glare) — Wi-Fi/cellular switches and dead relays heal without
 *   anyone touching anything.
 * - Signalling rides the SSE stream AND a poll fallback (/poll) — a proxy
 *   that swallows event-streams can no longer break negotiation.
 * - Audio AND video transceivers are pre-created sendrecv, so a late mic
 *   (permission prompt on phones) or a screen share reuses the same m-lines.
 * - Remote audio elements live in the DOM with playsinline and are unlocked
 *   on the join tap + on the next tap anywhere — mobile browsers only allow
 *   playback after a user gesture.
 * - The microphone can be re-requested (retryMic) if the first ask failed.
 * - Per-listener volume: setUserVolume(uid, v) changes how loud ONE person is
 *   FOR ME only (persisted per browser); dubbing ducks temporarily and
 *   restores to my chosen level, never to a fixed default.
 */

const DEFAULT_ICE: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:global.stun.twilio.com:3478"] },
];

const VOL_KEY = "cova-peer-vol";

/** Persisted per-listener volumes (uid -> 0..1), shared across rooms/sessions. */
function readSavedVolumes(): Map<string, number> {
  try {
    const raw = window.localStorage.getItem(VOL_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const m = new Map<string, number>();
    for (const [k, v] of Object.entries(obj))
      if (typeof v === "number" && v >= 0 && v <= 1) m.set(k, v);
    return m;
  } catch {
    return new Map();
  }
}

interface Peer {
  pc: RTCPeerConnection;
  /** Set when the owning hook unmounted — async offer work must stop. */
  closed: boolean;
  /** Hidden <audio> pinned to the DOM so mobile browsers will play it. */
  audio: HTMLAudioElement;
  /** Pre-created sendrecv senders: late mic / screen tracks reuse them. */
  audioTransceiver: RTCRtpTransceiver;
  videoTransceiver: RTCRtpTransceiver;
  /** Second video m-line, reserved for the camera (screen share uses the first). */
  camTransceiver: RTCRtpTransceiver;
  ctl: RTCDataChannel | null;
  analyser: AnalyserNode | null;
  pendingIce: RTCIceCandidateInit[];
  /** Perfect-negotiation bookkeeping (per pair). */
  makingOffer: boolean;
  ignoreOffer: boolean;
  settingRemoteAnswerPending: boolean;
  /** Viewer-set volume 0..1 (dubbing ducks it); deafen forces 0. */
  baseVolume: number;
  level: number;
  data: Uint8Array<ArrayBuffer>;
}

/** Remote-control session state (one controller at a time, room-wide). */
export interface RoomVoiceCtl {
  /** Host: I allow control and show this verification code. */
  allowed: boolean;
  code: string | null;
  /** Host: uid of the person controlling my page right now. */
  controlledBy: string | null;
  /** Viewer: uid whose screen I control. */
  controlling: string | null;
  /** Viewer: uid I asked for (waiting to type the code). */
  requested: string | null;
  /** Viewer: the sharer allowed control (broadcast over the data channel). */
  remoteAllowed: boolean;
  /** Viewer: the code the sharer published — the form shows only when set. */
  remoteCode: string | null;
  /** Viewer: uid of whoever controls the sharer's screen right now. */
  remoteCtlBy: string | null;
  /** i18n key of the last problem / status, shown by the overlay. */
  notice: string | null;
}

/** Viewer/host actions exposed by the mesh for the screen-share overlay. */
export interface RoomVoiceCtlActions {
  enableControl: () => void;
  disableControl: () => void;
  requestControl: (uid: string) => void;
  submitCode: (code: string, uid: string) => void;
  cancelRequest: () => void;
  clearNotice: () => void;
  /** Viewer-side input injection toward the peer being controlled. */
  pointer: (x: number, y: number) => void;
  down: (x: number, y: number) => void;
  up: (x: number, y: number) => void;
  wheel: (x: number, y: number, dx: number, dy: number) => void;
  key: (kind: "kd" | "ku", key: string) => void;
  /** Speaker: tell the room "I am dubbing into this language" (broadcast). */
  broadcastDub: (on: boolean, lang: string) => void;
}

type CtlMsg =
  | { t: "share"; on: boolean }
  | { t: "ctl-req" }
  | { t: "ctl-verify"; code: string }
  | { t: "ctl-grant" }
  | { t: "ctl-deny"; why?: "wrong" | "busy" | "off" }
  | { t: "ctl-revoke" }
  | { t: "ctl-state"; allowed: boolean; code: string | null; controlledBy: string | null }
  | { t: "cam"; on: boolean; facing: "user" | "environment" }
  | { t: "dub"; on: boolean; lang: string }
  | { t: "pt" | "pd" | "pu"; x: number; y: number }
  | { t: "wh"; x: number; y: number; dx: number; dy: number }
  | { t: "kd" | "ku"; key: string };

const EMPTY_CTL: RoomVoiceCtl = {
  allowed: false,
  code: null,
  controlledBy: null,
  controlling: null,
  requested: null,
  remoteAllowed: false,
  remoteCode: null,
  remoteCtlBy: null,
  notice: null,
};

interface Opts {
  enabled: boolean;
  meUid: string;
  peerUids: string[];
  sendSignal: (to: string, payload: unknown) => void;
  onSignal: (fn: (s: Signal) => void) => () => void;
}

export function useVoiceMesh({ enabled, meUid, peerUids, sendSignal, onSignal }: Opts) {
  const [micError, setMicError] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [deafened, setDeafenedState] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteVideos, setRemoteVideos] = useState<Record<string, MediaStream>>({});
  /** Signaled screen sharers — the ONLY source of truth for the overlay. */
  const [remoteShares, setRemoteShares] = useState<Record<string, boolean>>({});
  /** uid -> dubbing state of that peer (broadcast dubbing). */
  const [remoteDubs, setRemoteDubs] = useState<Record<string, string>>({});
  const [camStream, setCamStream] = useState<MediaStream | null>(null);
  const [camFacing, setCamFacing] = useState<"user" | "environment">("user");
  const [remoteCams, setRemoteCams] = useState<Record<string, MediaStream>>({});
  const [remoteCamFacing, setRemoteCamFacing] = useState<Record<string, "user" | "environment">>({});
  const [ctl, setCtl] = useState<RoomVoiceCtl>(EMPTY_CTL);
  /** Reactive mirror of userVolumes — drives the per-person volume sliders. */
  const [volumes, setVolumes] = useState<Record<string, number>>({});

  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const peers = useRef(new Map<string, Peer>());
  const screenTrack = useRef<MediaStreamTrack | null>(null);
  const camTrackRef = useRef<MediaStreamTrack | null>(null);
  const camFacingRef = useRef<"user" | "environment">("user");
  const retryRef = useRef<(() => void) | null>(null);
  const deafRef = useRef(false);
  const ctlRef = useRef<RoomVoiceCtl>(EMPTY_CTL);
  const sharingRef = useRef(false);
  const dubRef = useRef({ on: false, lang: "" });
  const sendRef = useRef(sendSignal);
  const meRef = useRef(meUid);
  /** Live ICE config (STUN always; TURN when COVA_TURN_* env vars are set). */
  const iceRef = useRef<RTCIceServer[]>(DEFAULT_ICE);
  /** My chosen loudness per peer ("for me only"), persisted across sessions. */
  const userVolumes = useRef<Map<string, number>>(new Map());
  /** ICE-restart bookkeeping per peer uid. */
  const iceRestarts = useRef(new Map<string, number>());
  const iceRetryTimers = useRef(new Map<string, number>());
  useEffect(() => {
    sendRef.current = sendSignal;
    meRef.current = meUid;
  });

  useEffect(() => {
    if (!enabled) return;
    const saved = readSavedVolumes();
    userVolumes.current = saved;
    const obj: Record<string, number> = {};
    saved.forEach((v, k) => (obj[k] = v));
    setVolumes(obj);
    fetch("/api/ice")
      .then((r) => r.json())
      .then((d: { iceServers?: RTCIceServer[] }) => {
        if (Array.isArray(d?.iceServers) && d.iceServers.length) iceRef.current = d.iceServers;
      })
      .catch(() => undefined);
  }, [enabled]);

  const patchCtl = useCallback((part: Partial<RoomVoiceCtl>) => {
    ctlRef.current = { ...ctlRef.current, ...part };
    setCtl(ctlRef.current);
  }, []);

  const measure = (an: AnalyserNode, data: Uint8Array<ArrayBuffer>, prev: number) => {
    an.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i]! - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    const target = Math.min(1, Math.max(0, (rms - 0.015) * 7));
    return prev + (target - prev) * 0.5;
  };

  const mineRef = useRef<{
    analyser: AnalyserNode;
    data: Uint8Array<ArrayBuffer>;
    level: number;
  } | null>(null);

  /**
   * Shared placeholder tracks (mute oscillator audio + 2x2 black canvas
   * video). They are attached to every peer's pre-created transceivers the
   * moment the connection exists, so the FIRST offer/answer is sendrecv on
   * every m-line. Without them a m-line answered before the real track
   * existed narrows to recvonly — and a later replaceTrack() never re-opens
   * it, which permanently killed a late mic / screen / camera for that peer.
   * With placeholders, swapping in the real track is instantaneous and needs
   * no renegotiation at all.
   */
  const silence = useRef<{ audio?: MediaStreamTrack; video?: MediaStreamTrack; video2?: MediaStreamTrack }>({});
  const getSilence = useCallback((): {
    audio?: MediaStreamTrack;
    video?: MediaStreamTrack;
    video2?: MediaStreamTrack;
  } => {
    const ac = ctx.current;
    if (!ac) return silence.current;
    if (!silence.current.audio) {
      try {
        const dst = ac.createMediaStreamDestination();
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(dst);
        osc.start();
        silence.current.audio = dst.stream.getAudioTracks()[0] ?? undefined;
        const canvas = document.createElement("canvas");
        canvas.width = 2;
        canvas.height = 2;
        const g = canvas.getContext("2d");
        if (g) {
          g.fillStyle = "#000";
          g.fillRect(0, 0, 2, 2);
        }
        silence.current.video = canvas.captureStream(1).getVideoTracks()[0] ?? undefined;
        const canvas2 = document.createElement("canvas");
        canvas2.width = 2;
        canvas2.height = 2;
        const g2 = canvas2.getContext("2d");
        if (g2) {
          g2.fillStyle = "#000";
          g2.fillRect(0, 0, 2, 2);
        }
        silence.current.video2 = canvas2.captureStream(1).getVideoTracks()[0] ?? undefined;
      } catch {
        /* placeholders are best-effort */
      }
    }
    return silence.current;
  }, []);

  const getLevel = useCallback((uid: string): number => {
    if (uid === meRef.current) {
      const m = mineRef.current;
      if (!m) return 0;
      m.level = measure(m.analyser, m.data, m.level);
      return m.level;
    }
    const p = peers.current.get(uid);
    if (!p?.analyser) return 0;
    p.level = measure(p.analyser, p.data, p.level);
    return p.level;
  }, []);

  const applyVolume = useCallback((p: Peer) => {
    p.audio.volume = deafRef.current ? 0 : p.baseVolume;
  }, []);

  const setMuted = useCallback((value: boolean) => {
    setMutedState(value);
    stream.current?.getAudioTracks().forEach((t) => (t.enabled = !value));
  }, []);

  /** Moderator deafen: every incoming audio element goes silent. */
  const setDeafened = useCallback(
    (value: boolean) => {
      deafRef.current = value;
      setDeafenedState(value);
      peers.current.forEach(applyVolume);
    },
    [applyVolume],
  );

  /** Duck / restore one speaker's raw microphone (dubbing). */
  const setPeerVolume = useCallback(
    (uid: string, v: number) => {
      const p = peers.current.get(uid);
      if (!p) return;
      p.baseVolume = Math.min(1, Math.max(0, v));
      applyVolume(p);
    },
    [applyVolume],
  );

  /** Change how loud ONE person is FOR ME only (the volume slider). */
  const setUserVolume = useCallback(
    (uid: string, v: number) => {
      const vol = Math.min(1, Math.max(0, v));
      userVolumes.current.set(uid, vol);
      setVolumes((prev) => (prev[uid] === vol ? prev : { ...prev, [uid]: vol }));
      try {
        const obj: Record<string, number> = {};
        userVolumes.current.forEach((val, k) => (obj[k] = val));
        window.localStorage.setItem(VOL_KEY, JSON.stringify(obj));
      } catch {
        /* storage unavailable */
      }
      setPeerVolume(uid, vol);
    },
    [setPeerVolume],
  );

  /** End of a duck: back to my chosen level, or stay whisper-low while their
      dubbing is still running (the room hears the translation, not the mic). */
  const restorePeerVolume = useCallback(
    (uid: string, stillDubbing: boolean) => {
      setPeerVolume(uid, resolveRestoreVolume(stillDubbing, userVolumes.current.get(uid)));
    },
    [setPeerVolume],
  );

  /** Unlocks audio playback on phones: must run inside a user gesture. */
  const unlock = useCallback(() => {
    void ctx.current?.resume().catch(() => undefined);
    peers.current.forEach((p) => {
      const pr = p.audio.play();
      if (pr) pr.catch(() => undefined);
    });
  }, []);

  /* ---------------- data channel: share + remote control ---------------- */

  const ctlSend = useCallback((uid: string, msg: CtlMsg): void => {
    const ch = peers.current.get(uid)?.ctl;
    if (ch && ch.readyState === "open") {
      try {
        ch.send(JSON.stringify(msg));
      } catch {
        /* channel closing */
      }
    }
  }, []);

  const ctlBroadcast = useCallback(
    (msg: CtlMsg): void => {
      peers.current.forEach((_p, uid) => ctlSend(uid, msg));
    },
    [ctlSend],
  );

  /** Host: publish allowed/code/controlledBy to every peer (data channels). */
  const broadcastCtlState = useCallback(
    (state: { allowed: boolean; code: string | null; controlledBy: string | null }) => {
      ctlBroadcast({
        t: "ctl-state",
        allowed: state.allowed,
        code: state.code,
        controlledBy: state.controlledBy,
      });
    },
    [ctlBroadcast],
  );

  const handleCtl = useCallback(
    (msg: CtlMsg, uid: string) => {
      const cur = ctlRef.current;
      switch (msg.t) {
        case "share": {
          // Signaled share state — the overlay renders only from this, never
          // from a bare WebRTC track (that is what created ghost screens).
          setRemoteShares((prev) => {
            if (msg.on) return prev[uid] ? prev : { ...prev, [uid]: true };
            if (!(uid in prev)) return prev;
            const next = { ...prev };
            delete next[uid];
            return next;
          });
          if (!msg.on && (cur.controlling === uid || cur.requested === uid)) {
            patchCtl({
              controlling: cur.controlling === uid ? null : cur.controlling,
              requested: cur.requested === uid ? null : cur.requested,
              notice: cur.controlling === uid ? "room.ctlRevoked" : cur.notice,
            });
          }
          return;
        }
        case "ctl-req": {
          // I am the host: the viewer will send the code next; a polite
          // rejection with the reason when control is not enabled.
          if (!cur.allowed || !cur.code) ctlSend(uid, { t: "ctl-deny", why: "off" });
          return;
        }
        case "ctl-verify": {
          // Exclusive by design: exactly one controller holds the screen.
          const d = ctlVerifyDecision(cur, uid, msg.code);
          if (d === "grant") {
            ctlSend(uid, { t: "ctl-grant" });
            patchCtl({ controlledBy: uid });
            // Everyone must see the seat is taken, not just the host.
            broadcastCtlState({ ...cur, controlledBy: uid });
          } else {
            ctlSend(uid, {
              t: "ctl-deny",
              why: d === "busy" ? "busy" : d === "off" ? "off" : "wrong",
            });
          }
          return;
        }
        case "ctl-state": {
          // The sharer publishes allowed / code / who controls, so every
          // viewer sees the code-entry form without asking first.
          patchCtl({
            remoteAllowed: !!msg.allowed,
            remoteCode: msg.code ?? null,
            remoteCtlBy: msg.controlledBy ?? null,
          });
          return;
        }
        case "cam": {
          setRemoteCamFacing((prev) => {
            if (msg.on) return { ...prev, [uid]: msg.facing };
            if (!(uid in prev)) return prev;
            const next = { ...prev };
            delete next[uid];
            return next;
          });
          return;
        }
        case "dub": {
          // Broadcast dubbing: everyone tracks who is dubbing into which
          // language, so listeners can duck the raw mic and speak the dub.
          setRemoteDubs((prev) => {
            if (msg.on) return prev[uid] === msg.lang ? prev : { ...prev, [uid]: msg.lang };
            if (!(uid in prev)) return prev;
            const next = { ...prev };
            delete next[uid];
            return next;
          });
          return;
        }
        case "ctl-grant": {
          if (cur.requested === uid) patchCtl({ controlling: uid, requested: null, notice: null });
          return;
        }
        case "ctl-deny": {
          if (cur.requested === uid)
            patchCtl({
              requested: null,
              notice:
                msg.why === "busy"
                  ? "room.ctlBusy"
                  : msg.why === "off"
                    ? "room.ctlOff"
                    : "room.ctlWrong",
            });
          return;
        }
        case "ctl-revoke": {
          if (cur.controlling === uid) patchCtl({ controlling: null, notice: "room.ctlRevoked" });
          if (cur.requested === uid) patchCtl({ requested: null });
          return;
        }
        // Input events from the controlling peer — only accepted from them.
        case "pt":
        case "pd":
        case "pu": {
          if (cur.controlledBy !== uid) return;
          injectPointer(
            msg.t === "pt" ? "move" : msg.t === "pd" ? "down" : "up",
            Number(msg.x) * window.innerWidth,
            Number(msg.y) * window.innerHeight,
          );
          return;
        }
        case "wh": {
          if (cur.controlledBy !== uid) return;
          injectWheel(
            Number(msg.x) * window.innerWidth,
            Number(msg.y) * window.innerHeight,
            Number(msg.dx),
            Number(msg.dy),
          );
          return;
        }
        case "kd":
        case "ku": {
          if (cur.controlledBy !== uid) return;
          injectKey(msg.t === "kd" ? "keydown" : "keyup", String(msg.key ?? ""));
          return;
        }
        default:
          return;
      }
    },
    [ctlSend, patchCtl, ctlBroadcast, broadcastCtlState],
  );

  const wireCtl = useCallback(
    (ch: RTCDataChannel, uid: string) => {
      const p = peers.current.get(uid);
      if (!p) return;
      p.ctl = ch;
      ch.onmessage = (event) => {
        try {
          handleCtl(JSON.parse(String(event.data)) as CtlMsg, uid);
        } catch {
          /* malformed message */
        }
      };
      // enableControl() only reaches channels that are already open, so a
      // viewer who joined later never saw the code-entry form. Push the
      // host's control state every time a control channel becomes usable.
      const pushCtlState = () => {
        const cur = ctlRef.current;
        if (cur.allowed || cur.controlledBy)
          broadcastCtlState({ allowed: cur.allowed, code: cur.code, controlledBy: cur.controlledBy });
      };
      if (ch.readyState === "open") pushCtlState();
      else ch.onopen = pushCtlState;
      // Late joiners must also learn the live share / camera / dub state —
      // none of that may depend on catching an old broadcast. A track alone
      // is never treated as proof of sharing (that rendered ghost screens).
      const syncLate = () => {
        pushCtlState();
        for (const m of lateJoinPushes({
          sharing: sharingRef.current,
          camOn: !!camTrackRef.current,
          camFacing: camFacingRef.current,
          dubOn: dubRef.current.on,
          dubLang: dubRef.current.lang,
        }))
          ctlSend(uid, m as CtlMsg);
      };
      if (ch.readyState === "open") syncLate();
      else ch.onopen = syncLate;
      ch.onclose = () => {
        if (p.ctl === ch) p.ctl = null;
        setRemoteShares((prev) => {
          if (!(uid in prev)) return prev;
          const next = { ...prev };
          delete next[uid];
          return next;
        });
        setRemoteDubs((prev) => {
          if (!(uid in prev)) return prev;
          const next = { ...prev };
          delete next[uid];
          return next;
        });
        const cur = ctlRef.current;
        if (cur.controlling === uid || cur.requested === uid || cur.controlledBy === uid) {
          const next = {
            controlling: cur.controlling === uid ? null : cur.controlling,
            requested: cur.requested === uid ? null : cur.requested,
            controlledBy: cur.controlledBy === uid ? null : cur.controlledBy,
            notice: cur.controlling === uid ? "room.ctlRevoked" : cur.notice,
          };
          patchCtl(next);
          // I was the host and my controller vanished: re-publish the seat.
          if (cur.controlledBy === uid) broadcastCtlState({ ...cur, controlledBy: null });
        }
      };
    },
    [handleCtl, patchCtl, broadcastCtlState, ctlSend],
  );

  /* ------------------------------ peers ------------------------------ */

  const addVideo = useCallback((uid: string, s: MediaStream) => {
    setRemoteVideos((prev) => (prev[uid] === s ? prev : { ...prev, [uid]: s }));
  }, []);
  const dropVideo = useCallback((uid: string) => {
    setRemoteVideos((prev) => {
      if (!(uid in prev)) return prev;
      const next = { ...prev };
      delete next[uid];
      return next;
    });
  }, []);
  const addCam = useCallback((uid: string, s: MediaStream) => {
    setRemoteCams((prev) => (prev[uid] === s ? prev : { ...prev, [uid]: s }));
  }, []);
  const dropCam = useCallback((uid: string) => {
    setRemoteCams((prev) => {
      if (!(uid in prev)) return prev;
      const next = { ...prev };
      delete next[uid];
      return next;
    });
  }, []);

  const ensurePeer = useCallback(
    (uid: string): Peer => {
      const existing = peers.current.get(uid);
      if (existing) return existing;

      const pc = new RTCPeerConnection({
        iceServers: iceRef.current,
        iceCandidatePoolSize: 4,
      });
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("playsinline", "true");
      audio.style.display = "none";
      document.body.appendChild(audio);

      const silence = getSilence();

      const peer: Peer = {
        pc,
        audio,
        // Filled by whichever side this is: the offerer captures its own
        // addTransceiver() transceivers, the answerer captures the ones
        // addTrack() re-uses when it fills the offer's m-lines.
        audioTransceiver: null as unknown as RTCRtpTransceiver,
        videoTransceiver: null as unknown as RTCRtpTransceiver,
        camTransceiver: null as unknown as RTCRtpTransceiver,
        ctl: null,
        analyser: null,
        pendingIce: [],
        makingOffer: false,
        ignoreOffer: false,
        settingRemoteAnswerPending: false,
        baseVolume: 1,
        level: 0,
        data: new Uint8Array(new ArrayBuffer(512)),
        closed: false,
      };
      peers.current.set(uid, peer);
      applyVolume(peer);
      // Start at MY chosen loudness for this person (slider persistence).
      const saved = userVolumes.current.get(uid);
      if (saved !== undefined) peer.baseVolume = saved;
      applyVolume(peer);

      /* ---------------- DETERMINISTIC NEGOTIATION ----------------
       * Exactly ONE round, driven by the peer with the LARGER uid:
       *  - offerer: builds audio/screen/camera m-lines up front with
       *    placeholder senders, offers once, and later swaps real tracks in
       *    with replaceTrack() (instant, no renegotiation).
       *  - answerer: applies the offer, then fills the same three m-lines
       *    with addTrack(track, stream) — the ONLY attachment Chrome honours
       *    when composing an answer — and answers once.
       * Perfect negotiation (both sides offering + rollback) deadlocked real
       * browsers here: colliding offers threw "the order of m-lines doesn't
       * match", nobody ever answered and the room sat in silence. */
      const isOfferer = meRef.current > uid;
      if (isOfferer) {
        peer.audioTransceiver = pc.addTransceiver("audio", { direction: "sendrecv" });
        peer.videoTransceiver = pc.addTransceiver("video", { direction: "sendrecv" });
        peer.camTransceiver = pc.addTransceiver("video", { direction: "sendrecv" });
        // Placeholder senders (mute audio / black video): the offer is
        // sendrecv on every m-line, so a real track attached later is an
        // instant replaceTrack() with no renegotiation whatsoever.
        try {
          if (silence.audio) void peer.audioTransceiver.sender.replaceTrack(silence.audio);
          if (silence.video) {
            void peer.videoTransceiver.sender.replaceTrack(silence.video);
            void peer.camTransceiver.sender.replaceTrack(silence.video);
          }
        } catch {
          /* peer closing */
        }
        // Only the offerer's data channel is negotiated; the answerer picks
        // it up through ondatachannel.
        wireCtl(pc.createDataChannel("cova-ctl"), uid);
        const work = async () => {
          try {
            const offer = await pc.createOffer();
            if (peer.closed) return;
            await pc.setLocalDescription(offer);
            if (pc.localDescription && !peer.closed)
              sendRef.current(uid, { kind: "sdp", description: pc.localDescription });
          } catch (e) {
            if (!peer.closed) console.error("[MESH-ERR] offer failed", (e as Error)?.message ?? e);
          }
        };
        void work();
      }
      pc.ondatachannel = (event) => wireCtl(event.channel, uid);

      pc.onicecandidate = (e) => {
        if (e.candidate) sendRef.current(uid, { kind: "ice", candidate: e.candidate.toJSON() });
      };

      pc.ontrack = (e) => {
        const track = e.track;
        const remote = e.streams[0] ?? new MediaStream([track]);
        if (track.kind === "audio") {
          peer.audio.srcObject = remote;
          const pr = peer.audio.play();
          if (pr) pr.catch(() => undefined);
          if (ctx.current && !peer.analyser) {
            const an = ctx.current.createAnalyser();
            an.fftSize = 512;
            ctx.current.createMediaStreamSource(remote).connect(an);
            peer.analyser = an;
            peer.data = new Uint8Array(new ArrayBuffer(an.fftSize));
          }
          return;
        }
        // Two video m-lines exist: m-line 1 carries a shared screen, m-line 2
        // a camera. The offer/answer order fixes the mapping for both roles,
        // and `mid` is the stable label (transceiver objects differ per side).
        if (e.transceiver.mid === "2") {
          addCam(uid, remote);
          track.onended = () => dropCam(uid);
          track.onmute = () => dropCam(uid);
          track.onunmute = () => addCam(uid, remote);
        } else {
          addVideo(uid, remote);
          track.onended = () => dropVideo(uid);
          track.onmute = () => dropVideo(uid);
          track.onunmute = () => addVideo(uid, remote);
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          iceRestarts.current.set(uid, 0);
          const t = iceRetryTimers.current.get(uid);
          if (t) {
            window.clearTimeout(t);
            iceRetryTimers.current.delete(uid);
          }
          return;
        }
        if (!isOfferer || peer.closed) return;
        // Dead connection -> the OFFERER re-offers with iceRestart (offerer
        // only, so the pair can never glare). Covers Wi-Fi <-> cellular
        // switches, a dying relay, and the first offer's ICE race.
        const failed = pc.connectionState === "failed";
        const disconnected = pc.connectionState === "disconnected";
        if (!failed && !disconnected) return;
        const attempt = (iceRestarts.current.get(uid) ?? 0) + 1;
        if (attempt > 8) return;
        const prev = iceRetryTimers.current.get(uid);
        if (prev) window.clearTimeout(prev);
        const delay = failed ? 1200 : 8000; // disconnected may self-heal first
        const timer = window.setTimeout(() => {
          iceRetryTimers.current.delete(uid);
          if (peer.closed || pc.connectionState === "connected") return;
          iceRestarts.current.set(uid, attempt);
          void (async () => {
            try {
              const offer = await pc.createOffer({ iceRestart: true });
              if (peer.closed) return;
              await pc.setLocalDescription(offer);
              if (pc.localDescription && !peer.closed)
                sendRef.current(uid, { kind: "sdp", description: pc.localDescription });
            } catch {
              /* next attempt retries */
            }
          })();
        }, delay);
        iceRetryTimers.current.set(uid, timer);
      };

      // BOTH sides create the control channel is NOT needed: the offerer's
      // application m-line carries it and the answerer receives it above.

      return peer;
    },
    [addVideo, applyVolume, dropVideo, wireCtl, getSilence],
  );

  /* --------------------- microphone (with retry) --------------------- */

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new AC();
    ctx.current = ac;

    const use = (s: MediaStream) => {
      if (cancelled) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = s;
      const an = ac.createAnalyser();
      an.fftSize = 512;
      ac.createMediaStreamSource(s).connect(an);
      mineRef.current = {
        analyser: an,
        data: new Uint8Array(new ArrayBuffer(an.fftSize)),
        level: 0,
      };
      const track = s.getAudioTracks()[0] ?? null;
      peers.current.forEach((p) => {
        // Ride the pre-created sendrecv audio transceiver (it carries a mute
        // placeholder until now, so this swap needs no renegotiation and the
        // room hears this microphone the moment it exists).
        try {
          if (track && p.audioTransceiver.sender.track !== track)
            void p.audioTransceiver.sender.replaceTrack(track);
        } catch {
          /* peer closing */
        }
      });
      setMicError(false);
    };

    const request = () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMicError(true);
        return;
      }
      navigator.mediaDevices
        .getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        })
        .then(use)
        .catch(() => {
          if (!cancelled) setMicError(true);
        });
    };
    request();
    retryRef.current = () => {
      if (!cancelled) request();
    };

    const peerMap = peers.current;
    return () => {
      cancelled = true;
      retryRef.current = null;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      mineRef.current = null;
      // Leaving the room also drops sharing / camera / control / remote state.
      const sTrack = screenTrack.current;
      screenTrack.current = null;
      if (sTrack) sTrack.stop();
      const cTrack = camTrackRef.current;
      camTrackRef.current = null;
      if (cTrack) cTrack.stop();
      peerMap.forEach((p) => {
        p.closed = true;
        p.pc.close();
        p.audio.srcObject = null;
        p.audio.remove();
      });
      peerMap.clear();
      iceRetryTimers.current.forEach((t) => window.clearTimeout(t));
      iceRetryTimers.current.clear();
      iceRestarts.current.clear();
      // The shared placeholder tracks (mute audio / black video) die with the
      // room; a fresh session builds new ones.
      silence.current.audio?.stop();
      silence.current.video?.stop();
      silence.current.video2?.stop();
      silence.current = {};
      void ac.close().catch(() => undefined);
      if (ctx.current === ac) ctx.current = null;
      setSharing(false);
      sharingRef.current = false;
      setShareNotice(null);
      setRemoteVideos({});
      setRemoteShares({});
      setRemoteDubs({});
      setCamStream(null);
      setCamFacing("user");
      camFacingRef.current = "user";
      setRemoteCams({});
      setRemoteCamFacing({});
      ctlRef.current = EMPTY_CTL;
      setCtl(EMPTY_CTL);
    };
  }, [enabled]);

  const retryMic = useCallback(() => {
    retryRef.current?.();
  }, []);

  /* --------------------- open/close with membership --------------------- */

  const peerKey = peerUids.join("|");
  useEffect(() => {
    if (!enabled) return;
    const want = new Set(peerUids.filter((u) => u !== meUid));
    want.forEach((uid) => {
      ensurePeer(uid);
      const p = peers.current.get(uid);
      // A fresh peer immediately receives my live mic / screen / camera on
      // the pre-created transceivers — instant swaps over the placeholders.
      if (stream.current) {
        const track = stream.current.getAudioTracks()[0];
        if (track && p) {
          try {
            if (p.audioTransceiver.sender.track !== track)
              void p.audioTransceiver.sender.replaceTrack(track);
          } catch {
            /* peer closing */
          }
        }
      }
      if (screenTrack.current && p) {
        try {
          p.videoTransceiver.sender.replaceTrack(screenTrack.current);
        } catch {
          /* peer closing */
        }
      }
      if (camTrackRef.current && p) {
        try {
          p.camTransceiver.sender.replaceTrack(camTrackRef.current);
        } catch {
          /* peer closing */
        }
      }
    });
    peers.current.forEach((p, uid) => {
      if (!want.has(uid)) {
        p.pc.close();
        p.audio.srcObject = null;
        p.audio.remove();
        peers.current.delete(uid);
        dropVideo(uid);
        dropCam(uid);
        // A gone peer cannot be sharing, dubbing or holding the control.
        setRemoteShares((prev) => {
          if (!(uid in prev)) return prev;
          const next = { ...prev };
          delete next[uid];
          return next;
        });
        setRemoteDubs((prev) => {
          if (!(uid in prev)) return prev;
          const next = { ...prev };
          delete next[uid];
          return next;
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, peerKey, meUid, ensurePeer, dropVideo, dropCam]);

  /* --------------------------- signaling --------------------------- */

  useEffect(() => {
    if (!enabled) return;
    const handler = async ({ from, payload }: Signal) => {
      const msg = payload as
        | { kind: "sdp"; description: RTCSessionDescriptionInit }
        | { kind: "ice"; candidate: RTCIceCandidateInit };
      const p = ensurePeer(from);
      try {
        if (msg.kind === "sdp") {
          const description = msg.description;
          if (description.type === "offer") {
            // I am the answerer. Only a stable PC can take the (single) offer;
            // anything else is a stale duplicate from an earlier round.
            if (p.pc.signalingState !== "stable") return;
            await p.pc.setRemoteDescription(description);
            for (const c of p.pendingIce.splice(0)) await p.pc.addIceCandidate(c);
            // Fill the offered m-lines with my live tracks (or standby
            // placeholders) via addTrack(track, stream) — the ONLY attachment
            // Chrome honours when composing an answer (a replaceTrack before
            // the first answer is ignored and the answer narrows to recvonly,
            // which muted the answerer's mic forever). Order = m-line order:
            // audio, screen, camera. Real tracks when they already exist so
            // the answer carries my true state; otherwise the standby ones
            // keep the m-line sendrecv and a later real swap is instant.
            const sil = getSilence();
            const a = stream.current?.getAudioTracks()[0] ?? sil.audio;
            const s = screenTrack.current ?? sil.video;
            const c = camTrackRef.current ?? sil.video2;
            if (a) p.pc.addTrack(a, new MediaStream([a]));
            if (s) p.pc.addTrack(s, new MediaStream([s]));
            if (c) p.pc.addTrack(c, new MediaStream([c]));
            // Capture the transceivers addTrack re-used (association order =
            // the offer's m-line order: audio, screen, camera).
            const ts = p.pc.getTransceivers().filter((t) => t.mid !== null);
            if (ts[0]) p.audioTransceiver = ts[0];
            if (ts[1]) p.videoTransceiver = ts[1];
            if (ts[2]) p.camTransceiver = ts[2];
            await p.pc.setLocalDescription();
            if (p.pc.localDescription)
              sendRef.current(from, { kind: "sdp", description: p.pc.localDescription });
          } else {
            // The answer to my one and only initial offer.
            if (p.pc.signalingState !== "have-local-offer") return;
            await p.pc.setRemoteDescription(description);
            for (const c of p.pendingIce.splice(0)) await p.pc.addIceCandidate(c);
          }
        } else {
          if (p.pc.remoteDescription) await p.pc.addIceCandidate(msg.candidate);
          else p.pendingIce.push(msg.candidate);
        }
      } catch (e) {
        console.error("[MESH-ERR]", (e as Error)?.message ?? e);
      }
    };
    return onSignal((s) => void handler(s));
  }, [enabled, ensurePeer, onSignal, getSilence]);

  /* ------------------------ screen sharing ------------------------ */

  const stopShare = useCallback(() => {
    const track = screenTrack.current;
    screenTrack.current = null;
    setScreenStream(null);
    sharingRef.current = false;
    if (track) track.stop();
    peers.current.forEach((p) => {
      try {
        // Stop SENDING the screen but keep the m-line (replaceTrack(null)):
        // removeTrack() would demand a renegotiation round, and the m-line
        // must stay for the next share anyway. The remote track mutes and
        // the overlay disappears through its onmute handler.
        p.videoTransceiver.sender.replaceTrack(null);
      } catch {
        /* peer closing */
      }
    });
    setSharing(false);
    ctlBroadcast({ t: "share", on: false });
    // Sharing stopped -> remote control must stop with it.
    const cur = ctlRef.current;
    if (cur.controlledBy) ctlSend(cur.controlledBy, { t: "ctl-revoke" });
    if (cur.allowed || cur.controlledBy) {
      patchCtl({ allowed: false, code: null, controlledBy: null });
      broadcastCtlState({ allowed: false, code: null, controlledBy: null });
    }
  }, [ctlBroadcast, ctlSend, patchCtl, broadcastCtlState]);

  const toggleShare = useCallback(async () => {
    if (sharing) {
      stopShare();
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setShareNotice("room.shareDenied");
      return;
    }
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = screen.getVideoTracks()[0] ?? null;
      if (!track) return;
      screenTrack.current = track;
      setScreenStream(screen);
      peers.current.forEach((p) => {
        try {
          // Explicit screen m-line: the camera has its own transceiver. The
          // m-line carries a black placeholder, so this swap is instant and
          // needs no renegotiation.
          p.videoTransceiver.sender.replaceTrack(track);
        } catch {
          /* peer closing */
        }
      });
      track.onended = () => stopShare();
      sharingRef.current = true;
      setSharing(true);
      setShareNotice(null);
      ctlBroadcast({ t: "share", on: true });
    } catch {
      setScreenStream(null);
      setShareNotice("room.shareDenied");
    }
  }, [ctlBroadcast, sharing, stopShare]);

  /* ----------------------------- camera ----------------------------- */

  const stopCam = useCallback(() => {
    const track = camTrackRef.current;
    camTrackRef.current = null;
    setCamStream(null);
    if (track) track.stop();
    peers.current.forEach((p) => {
      try {
        p.camTransceiver.sender.replaceTrack(null); // remote track mutes -> tile disappears
      } catch {
        /* peer closing */
      }
    });
    ctlBroadcast({ t: "cam", on: false, facing: camFacingRef.current });
  }, [ctlBroadcast]);

  /** Opens my camera and streams it to the whole room (screen share keeps working). */
  const toggleCam = useCallback(async () => {
    if (camTrackRef.current) {
      stopCam();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setShareNotice("room.camDenied");
      return;
    }
    try {
      const cam = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: camFacingRef.current, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      const track = cam.getVideoTracks()[0] ?? null;
      if (!track) {
        cam.getTracks().forEach((tr) => tr.stop());
        setShareNotice("room.camDenied");
        return;
      }
      camTrackRef.current = track;
      setCamStream(cam);
      setShareNotice(null);
      peers.current.forEach((p) => {
        try {
          p.camTransceiver.sender.replaceTrack(track);
        } catch {
          /* peer closing */
        }
      });
      ctlBroadcast({ t: "cam", on: true, facing: camFacingRef.current });
    } catch {
      setShareNotice("room.camDenied");
    }
  }, [ctlBroadcast, stopCam]);

  /** Front <-> back camera (phones): re-opens the device and swaps the track. */
  const flipCam = useCallback(async () => {
    if (!camTrackRef.current) return;
    const next = camFacingRef.current === "user" ? "environment" : "user";
    try {
      const cam = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: next }, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      const track = cam.getVideoTracks()[0] ?? null;
      if (!track) {
        cam.getTracks().forEach((tr) => tr.stop());
        return;
      }
      camTrackRef.current?.stop();
      camTrackRef.current = track;
      camFacingRef.current = next;
      setCamFacing(next);
      setCamStream(cam);
      peers.current.forEach((p) => {
        try {
          p.camTransceiver.sender.replaceTrack(track);
        } catch {
          /* peer closing */
        }
      });
      ctlBroadcast({ t: "cam", on: true, facing: next });
    } catch {
      // One-camera devices (most laptops) cannot flip — keep the current view.
      setShareNotice("room.camFlipFail");
    }
  }, [ctlBroadcast]);

  /* ----------------------- remote control API ----------------------- */

  const ctlActions: RoomVoiceCtlActions = {
    /** Host: show the verification code and allow one controller. */
    enableControl: () => {
      if (!screenTrack.current) {
        patchCtl({ notice: "room.ctlNeedShare" });
        return;
      }
      const next = {
        allowed: true,
        code: String(Math.floor(100000 + Math.random() * 900000)),
        controlledBy: ctlRef.current.controlledBy,
      };
      patchCtl(next);
      // Publish so every viewer sees the code-entry form immediately.
      broadcastCtlState(next);
    },
    /** Host: stop allowing control and kick the controller out. */
    disableControl: () => {
      const cur = ctlRef.current;
      if (cur.controlledBy) ctlSend(cur.controlledBy, { t: "ctl-revoke" });
      patchCtl({ allowed: false, code: null, controlledBy: null });
      broadcastCtlState({ allowed: false, code: null, controlledBy: null });
    },
    /** Viewer: ask to control; the host verifies the code shown on screen. */
    requestControl: (uid: string) => {
      const p = peers.current.get(uid);
      if (!p?.ctl || p.ctl.readyState !== "open") {
        patchCtl({ notice: "room.ctlUnavailable" });
        return;
      }
      ctlSend(uid, { t: "ctl-req" });
      patchCtl({ requested: uid, notice: null });
    },
    /** Viewer: send the 6-digit code to the named sharer (one controller max). */
    submitCode: (code: string, uid: string) => {
      const clean = code.replace(/\D/g, "").slice(0, 6);
      if (clean.length !== 6) return;
      patchCtl({ requested: uid, notice: null });
      ctlSend(uid, { t: "ctl-verify", code: clean });
    },
    cancelRequest: () => patchCtl({ requested: null }),
    clearNotice: () => {
      if (ctlRef.current.notice) patchCtl({ notice: null });
      if (shareNotice) setShareNotice(null);
    },
    pointer: (x, y) => {
      const uid = ctlRef.current.controlling;
      if (uid) ctlSend(uid, { t: "pt", x, y });
    },
    down: (x, y) => {
      const uid = ctlRef.current.controlling;
      if (uid) ctlSend(uid, { t: "pd", x, y });
    },
    up: (x, y) => {
      const uid = ctlRef.current.controlling;
      if (uid) ctlSend(uid, { t: "pu", x, y });
    },
    wheel: (x, y, dx, dy) => {
      const uid = ctlRef.current.controlling;
      if (uid) ctlSend(uid, { t: "wh", x, y, dx, dy });
    },
    key: (kind, key) => {
      const uid = ctlRef.current.controlling;
      if (uid) ctlSend(uid, { t: kind, key });
    },
    /** Speaker: publish "I dub into lang" so the room ducks my raw mic and
        hears the translation even before the first caption line lands. */
    broadcastDub: (on, lang) => {
      dubRef.current = { on, lang };
      ctlBroadcast({ t: "dub", on, lang });
    },
  };

  /* -------- one-time tap-anywhere audio unlock (mobile autoplay) -------- */
  useEffect(() => {
    if (!enabled) return;
    let done = false;
    const h = () => {
      if (done) return;
      done = true;
      unlock();
    };
    window.addEventListener("pointerdown", h, { once: true });
    return () => window.removeEventListener("pointerdown", h);
  }, [enabled, unlock]);

  return {
    getLevel,
    micError,
    muted,
    setMuted,
    retryMic,
    deafened,
    setDeafened,
    setPeerVolume,
    setUserVolume,
    restorePeerVolume,
    volumes,
    unlock,
    sharing,
    toggleShare,
    shareNotice,
    screenStream,
    remoteVideos,
    remoteShares,
    remoteDubs,
    camOn: !!camStream,
    camStream,
    camFacing,
    toggleCam,
    flipCam,
    remoteCams,
    remoteCamFacing,
    ctl,
    ctlActions,
  };
}
