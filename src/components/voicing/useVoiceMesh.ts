"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Signal } from "@/lib/spaces-client";

const ICE: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

interface Peer {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  analyser: AnalyserNode | null;
  pendingIce: RTCIceCandidateInit[];
  data: Uint8Array<ArrayBuffer>;
  level: number;
}

interface Opts {
  enabled: boolean;
  meUid: string;
  peerUids: string[];
  sendSignal: (to: string, payload: unknown) => void;
  onSignal: (fn: (s: Signal) => void) => () => void;
}

/**
 * Full-mesh WebRTC audio. For every pair, the peer with the smaller uid makes the offer, so
 * both sides never offer at once. Loudness of every participant (including me) is measured
 * locally with an AnalyserNode and exposed through getLevel(uid) for the avatars.
 */
export function useVoiceMesh({ enabled, meUid, peerUids, sendSignal, onSignal }: Opts) {
  const [micError, setMicError] = useState(false);
  const [muted, setMutedState] = useState(false);
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const peers = useRef(new Map<string, Peer>());
  const mine = useRef<{
    analyser: AnalyserNode;
    data: Uint8Array<ArrayBuffer>;
    level: number;
  } | null>(null);
  const sendRef = useRef(sendSignal);
  const meRef = useRef(meUid);
  useEffect(() => {
    sendRef.current = sendSignal;
    meRef.current = meUid;
  });

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

  const getLevel = useCallback((uid: string): number => {
    if (uid === meRef.current) {
      const m = mine.current;
      if (!m) return 0;
      m.level = measure(m.analyser, m.data, m.level);
      return m.level;
    }
    const p = peers.current.get(uid);
    if (!p?.analyser) return 0;
    p.level = measure(p.analyser, p.data, p.level);
    return p.level;
  }, []);

  const setMuted = useCallback((value: boolean) => {
    setMutedState(value);
    stream.current?.getAudioTracks().forEach((t) => (t.enabled = !value));
  }, []);

  // Microphone + shared AudioContext
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx.current = new AC();
    const media = navigator.mediaDevices
      ? navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        })
      : Promise.reject(new Error("no mediaDevices"));
    void media
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = s;
        const an = ctx.current!.createAnalyser();
        an.fftSize = 512;
        ctx.current!.createMediaStreamSource(s).connect(an);
        mine.current = {
          analyser: an,
          data: new Uint8Array(new ArrayBuffer(an.fftSize)),
          level: 0,
        };
        // Tracks added late are attached to peers that already exist.
        peers.current.forEach((p) => s.getTracks().forEach((t) => p.pc.addTrack(t, s)));
      })
      .catch(() => setMicError(true));
    const peerMap = peers.current;
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      mine.current = null;
      peerMap.forEach((p) => {
        p.pc.close();
        p.audio.srcObject = null;
      });
      peerMap.clear();
      void ctx.current?.close();
      ctx.current = null;
    };
  }, [enabled]);

  const ensurePeer = useCallback((uid: string): Peer => {
    const existing = peers.current.get(uid);
    if (existing) return existing;
    const pc = new RTCPeerConnection(ICE);
    const audio = new Audio();
    audio.autoplay = true;
    const peer: Peer = {
      pc,
      audio,
      analyser: null,
      pendingIce: [],
      data: new Uint8Array(new ArrayBuffer(512)),
      level: 0,
    };
    stream.current?.getTracks().forEach((t) => pc.addTrack(t, stream.current!));
    pc.onicecandidate = (e) => {
      if (e.candidate) sendRef.current(uid, { kind: "ice", candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      const remote = e.streams[0] ?? new MediaStream([e.track]);
      audio.srcObject = remote;
      void audio.play().catch(() => undefined);
      if (ctx.current && !peer.analyser) {
        const an = ctx.current.createAnalyser();
        an.fftSize = 512;
        ctx.current.createMediaStreamSource(remote).connect(an);
        peer.analyser = an;
        peer.data = new Uint8Array(new ArrayBuffer(an.fftSize));
      }
    };
    pc.onnegotiationneeded = async () => {
      if (meRef.current >= uid) return; // only the smaller uid offers
      try {
        await pc.setLocalDescription();
        sendRef.current(uid, { kind: "sdp", description: pc.localDescription });
      } catch {
        /* negotiation can fail if the peer vanished */
      }
    };
    peers.current.set(uid, peer);
    return peer;
  }, []);

  // Open/close connections as people come and go.
  const peerKey = peerUids.join("|");
  useEffect(() => {
    if (!enabled) return;
    const want = new Set(peerUids.filter((u) => u !== meUid));
    want.forEach((uid) => {
      const p = ensurePeer(uid);
      // Offerer side: make sure there is at least one transceiver so an offer is produced.
      if (meUid < uid && p.pc.getTransceivers().length === 0)
        p.pc.addTransceiver("audio", { direction: "sendrecv" });
    });
    peers.current.forEach((p, uid) => {
      if (!want.has(uid)) {
        p.pc.close();
        p.audio.srcObject = null;
        peers.current.delete(uid);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, peerKey, meUid, ensurePeer]);

  // Incoming offers / answers / ICE.
  useEffect(() => {
    if (!enabled) return;
    const handler = async ({ from, payload }: Signal) => {
      const msg = payload as
        | { kind: "sdp"; description: RTCSessionDescriptionInit }
        | { kind: "ice"; candidate: RTCIceCandidateInit };
      const p = ensurePeer(from);
      try {
        if (msg.kind === "sdp") {
          await p.pc.setRemoteDescription(msg.description);
          for (const c of p.pendingIce.splice(0)) await p.pc.addIceCandidate(c);
          if (msg.description.type === "offer") {
            await p.pc.setLocalDescription();
            sendRef.current(from, { kind: "sdp", description: p.pc.localDescription });
          }
        } else if (p.pc.remoteDescription) await p.pc.addIceCandidate(msg.candidate);
        else p.pendingIce.push(msg.candidate);
      } catch {
        /* stale signal for a closed connection */
      }
    };
    return onSignal((s) => void handler(s));
  }, [enabled, ensurePeer, onSignal]);

  return { getLevel, micError, muted, setMuted };
}
