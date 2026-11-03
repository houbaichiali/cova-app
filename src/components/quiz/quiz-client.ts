"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import type { QuizState } from "@/server/quiz-store";

export type { QuizState };

/** A quiz row as shown on the dashboard (never includes the question bank). */
export interface QuizSummary {
  id: string;
  title: string;
  description: string;
  category: string;
  mode: "live" | "challenge" | "solo";
  visibility: "public" | "private";
  question_count: number;
  time_per_question: number;
  scoring: "standard" | "fixed";
  pin: string | null;
  deadline: string | null;
}

export interface MyGameRow {
  game_id: string;
  nickname: string;
  score: number;
  correct: number;
  total: number;
  accuracy: number;
  avg_ms: number;
  game: { played_at: string; mode: string };
}

export interface LeaderRow {
  user_id: string;
  display_name: string;
  /** Postgres bigint arrives as a string through PostgREST. */
  total_score: number | string;
  games: number;
  best_score: number;
}

/** Access token for the API routes (they resolve the caller from it). */
export async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await getSupabase().auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** Current user id + display name, or null when signed out. */
export async function getMe(): Promise<{ id: string; name: string } | null> {
  try {
    const { data } = await getSupabase().auth.getUser();
    if (!data.user) return null;
    const name =
      (data.user.user_metadata?.full_name as string | undefined) ||
      (data.user.user_metadata?.name as string | undefined) ||
      data.user.email?.split("@")[0] ||
      "Student";
    return { id: data.user.id, name };
  } catch {
    return null;
  }
}

/** fetch with the caller's bearer token and JSON parsing. */
export async function api<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; data: T }> {
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, data };
}

/** POST one session action (join/start/answer/...). */
export function sessionAction(
  pin: string,
  action: string,
  extra: Record<string, unknown> = {},
): Promise<{ ok: boolean; data: { ok?: boolean; error?: string; gameId?: string; results?: unknown } }> {
  return api(`/api/quiz/session/${pin}`, {
    method: "POST",
    body: JSON.stringify({ action, ...extra }),
  });
}

/**
 * Live connection to one quiz session: initial GET then SSE updates. The
 * server pushes a fresh snapshot on every mutation and on its own timer
 * transitions, so the client never polls.
 */
export function useQuizSession(pin: string) {
  const [state, setState] = useState<QuizState | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notFound" | "signedOut">("loading");
  const [live, setLive] = useState(false);
  const meRef = useRef<string>("");

  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;
    void (async () => {
      const me = await getMe();
      if (cancelled) return;
      if (!me) {
        setStatus("signedOut");
        return;
      }
      meRef.current = me.id;
      const res = await api<{ state?: QuizState; error?: string }>(`/api/quiz/session/${pin}`);
      if (cancelled) return;
      if (!res.ok || !res.data.state) {
        setStatus("notFound");
        return;
      }
      setState(res.data.state);
      setStatus("ready");
      es = new EventSource(`/api/quiz/session/${pin}/events?uid=${encodeURIComponent(me.id)}`);
      es.onopen = () => setLive(true);
      es.addEventListener("state", (e) =>
        setState(JSON.parse((e as MessageEvent<string>).data) as QuizState),
      );
      es.addEventListener("closed", () => {
        es?.close();
        setLive(false);
        setStatus("notFound");
      });
    })();
    return () => {
      cancelled = true;
      es?.close();
      setLive(false);
    };
  }, [pin]);

  const join = useCallback(
    async (nickname: string) => {
      const res = await sessionAction(pin, "join", { nickname });
      return res.ok && res.data.ok === true;
    },
    [pin],
  );

  const act = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      const res = await sessionAction(pin, action, extra);
      // Optimistic refresh in case an SSE event was missed.
      if (res.ok && meRef.current) {
        const fresh = await api<{ state?: QuizState }>(`/api/quiz/session/${pin}`);
        if (fresh.ok && fresh.data.state) setState(fresh.data.state);
      }
      return res;
    },
    [pin],
  );

  return { state, status, live, join, act };
}
