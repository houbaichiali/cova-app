"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { demoActions, useDemoState } from "@/lib/demo-store";
import { useMe } from "@/lib/social-store";
import { currentUser as demoCurrentUser } from "@/data/students";
import type { Member, MyStatus, SpaceKind, SpaceSummary, SpaceView } from "@/server/spaces-store";

export type { Member, MyStatus, SpaceKind, SpaceSummary, SpaceView };

const UID_KEY = "cova-uid";

/**
 * Who am I for the server. Signed-in account -> stable id derived from the email, so the
 * same account is the same person in every tab. Guests get a random per-browser id.
 * DEMO LEVEL: no real authentication yet.
 */
let guestUid = "";
function readGuestUid(): string {
  if (guestUid) return guestUid;
  try {
    let v = window.localStorage.getItem(UID_KEY);
    if (!v) {
      v = `g-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
      window.localStorage.setItem(UID_KEY, v);
    }
    guestUid = v;
  } catch {
    guestUid = `g-${Math.random().toString(36).slice(2, 12)}`;
  }
  return guestUid;
}

export function useIdentity(): { uid: string; name: string; signedIn: boolean; ready: boolean } {
  const { session, settings } = useDemoState();
  const me = useMe(); // signed-in profile from the social store (null while loading/guest)
  // The social store falls back to a DEMO persona (fixed id "me") whenever
  // nobody is signed in. That persona must never become a room identity:
  // every guest would carry the same "u-me" id, the server would merge the
  // whole room into ONE member and nobody could ever hear or see anybody.
  const realMe = me && me.id !== demoCurrentUser.id ? me : null;
  const guest = useSyncExternalStore(
    () => () => {},
    readGuestUid,
    () => "",
  );
  // The real account wins: same uuid in every tab, same display name as the
  // profile. Guests keep their per-browser random id, so two devices are two
  // people. Fallbacks cover stale demo settings saved earlier.
  const uid = realMe ? `u-${realMe.id}` : session ? `u-${session.email.toLowerCase()}` : guest;
  const name =
    realMe?.displayName || session?.name || settings.displayName || "Guest";
  return { uid, name, signedIn: !!realMe || !!session, ready: !!uid };
}

export async function api<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; data: T }> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, data };
}

export function roomPath(kind: SpaceKind, code: string): string {
  return `${kind === "voice" ? "/voicing" : "/groups"}/${code}`;
}

export interface Signal {
  from: string;
  payload: unknown;
  /** Monotonic relay id — the poll fallback and SSE may deliver it twice. */
  id?: number;
}
export type SpaceEnd = "kicked" | "closed" | null;

/** Live connection to one space: info, my status, members, requests, chat and WebRTC signals. */
export function useSpace(code: string, uid: string) {
  const [view, setView] = useState<SpaceView | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [ended, setEnded] = useState<SpaceEnd>(null);
  const [live, setLive] = useState(false);
  const signalSubs = useRef(new Set<(s: Signal) => void>());
  const muteSubs = useRef(new Set<() => void>());
  const deafSubs = useRef(new Set<(value: boolean) => void>());
  /** Relay ids already dispatched — SSE and the poll fallback overlap. */
  const seenSignals = useRef(new Set<number>());
  const sinceRef = useRef(0);
  const sigRef = useRef("");
  const dispatchSignal = useCallback((s: Signal) => {
    if (typeof s.id === "number") {
      if (seenSignals.current.has(s.id)) return;
      seenSignals.current.add(s.id);
      if (seenSignals.current.size > 500) {
        const it = seenSignals.current.values().next();
        if (!it.done) seenSignals.current.delete(it.value);
      }
    }
    signalSubs.current.forEach((fn) => fn(s));
  }, []);
  const onSignal = useCallback((fn: (s: Signal) => void) => {
    signalSubs.current.add(fn);
    return () => void signalSubs.current.delete(fn);
  }, []);
  const onForceMute = useCallback((fn: () => void) => {
    muteSubs.current.add(fn);
    return () => void muteSubs.current.delete(fn);
  }, []);
  const onDeafen = useCallback((fn: (value: boolean) => void) => {
    deafSubs.current.add(fn);
    return () => void deafSubs.current.delete(fn);
  }, []);

  // Fresh room: drop any state left over from the previous one (React's
  // "adjust state when a prop changes" pattern, done during render).
  const [prevCode, setPrevCode] = useState(code);
  if (code !== prevCode) {
    setPrevCode(code);
    setView(null);
    setNotFound(false);
    setEnded(null);
    seenSignals.current = new Set();
    sinceRef.current = 0;
    sigRef.current = "";
  }

  // First load (works for people who are not in the space yet).
  useEffect(() => {
    if (!uid || !code) return;
    let cancelled = false;
    void api<{ space?: SpaceView }>(`/api/spaces/${code}?uid=${encodeURIComponent(uid)}`).then(
      (r) => {
        if (cancelled) return;
        if (r.ok && r.data.space) setView(r.data.space);
        else setNotFound(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [code, uid]);

  // Open the live stream once we are a member or waiting for approval.
  const status = view?.status;
  const wantsLive =
    status === "owner" || status === "mod" || status === "member" || status === "pending";
  useEffect(() => {
    if (!uid || !wantsLive) return;
    const es = new EventSource(`/api/spaces/${code}/events?uid=${encodeURIComponent(uid)}`);
    es.onopen = () => setLive(true);
    es.addEventListener("state", (e) =>
      setView(JSON.parse((e as MessageEvent<string>).data) as SpaceView),
    );
    es.addEventListener("signal", (e) =>
      dispatchSignal(JSON.parse((e as MessageEvent<string>).data) as Signal),
    );
    es.addEventListener("forceMute", () => muteSubs.current.forEach((fn) => fn()));
    es.addEventListener("deafenState", (e) => {
      let value = true;
      try {
        value = (JSON.parse((e as MessageEvent<string>).data) as { value?: boolean }).value !== false;
      } catch {
        /* keep default */
      }
      deafSubs.current.forEach((fn) => fn(value));
    });
    es.addEventListener("kicked", () => {
      setEnded("kicked");
      es.close();
    });
    es.addEventListener("closed", () => {
      setEnded("closed");
      es.close();
    });
    return () => {
      es.close();
      setLive(false);
    };
  }, [code, uid, wantsLive]);

  // POLL FALLBACK — the lifeline when the SSE stream dies behind a proxy
  // (Codespaces port forwarding swallows event-streams, which killed WebRTC
  // negotiation AND live captions at once). Every 400 ms: pick up relayed
  // signals from the server's ring buffer and refresh the view when its
  // fingerprint changed. Polling also keeps the member alive server-side.
  useEffect(() => {
    if (!uid || !wantsLive) return;
    let dead = false;
    const tick = async () => {
      try {
        const q = `uid=${encodeURIComponent(uid)}&since=${sinceRef.current}&sig=${encodeURIComponent(sigRef.current)}`;
        const res = await fetch(`/api/spaces/${code}/poll?${q}`, { cache: "no-store" });
        const d = (await res.json()) as {
          ok?: boolean;
          closed?: boolean;
          signals?: Signal[];
          next?: number;
          sig?: string;
          view?: SpaceView | null;
        };
        if (dead) return;
        if (d.closed) {
          setEnded("closed");
          return;
        }
        if (typeof d.next === "number") sinceRef.current = d.next;
        if (typeof d.sig === "string") sigRef.current = d.sig;
        for (const s of d.signals ?? []) dispatchSignal(s);
        if (d.view) setView(d.view);
      } catch {
        /* network hiccup — the next tick retries */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 400);
    return () => {
      dead = true;
      window.clearInterval(id);
    };
  }, [code, uid, wantsLive, dispatchSignal]);

  const send = useCallback(
    async (body: Record<string, unknown>) => {
      const r = await api<{ space?: SpaceView; error?: string }>(`/api/spaces/${code}`, {
        method: "POST",
        body: JSON.stringify({ uid, ...body }),
      });
      if (r.ok && r.data.space) setView(r.data.space);
      return r;
    },
    [code, uid],
  );

  return { view, notFound, ended, live, send, onSignal, onForceMute, onDeafen };
}

/** Awards XP for time spent in a voice room: one minute every 60 s while connected. */
export function useVoiceXp(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => demoActions.addVoiceMinute(), 60_000);
    return () => window.clearInterval(id);
  }, [active]);
}
