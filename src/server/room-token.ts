/**
 * Room identity tokens — the fix for "identity is claimed by the client".
 *
 * The in-memory spaces hub used to trust whatever `uid` the browser sent, so
 * anyone who knew a person's email (signed-in uids are `u-<email>`) could
 * claim their identity, become the room owner, kick/deafen everyone and read
 * every private room. Now the server SIGNS a short token per (room, person):
 *
 *   rt1.<base64url payload>.<base64url HMAC-SHA256>
 *   payload = { c: roomCode, u: uid, e: expiryMs }
 *
 * Every mutation, poll, SSE stream and member view must carry a valid token
 * bound to the SAME code and uid. Tokens are issued only on successful
 * join/create, so a third party can never act as somebody else.
 *
 * The secret comes from COVA_ROOM_SECRET (multi-instance deploys) or falls
 * back to a random per-process key — safe because room state itself lives in
 * one Node process and dies with it.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const ROOM_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, re-issued on every action

const PREFIX = "rt1.";
const MAX_TOKEN_LEN = 512;

interface TokenPayload {
  c: string;
  u: string;
  e: number;
}

const g = globalThis as unknown as { __covaRoomSecret?: Buffer };

function roomSecret(): Buffer {
  const env = (process.env.COVA_ROOM_SECRET ?? "").trim();
  if (env.length >= 32) return Buffer.from(env, "utf8");
  // Single-server mode: a random key per process is unguessable and needs no setup.
  return (g.__covaRoomSecret ??= randomBytes(32));
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function hmac(payload: string): Buffer {
  return createHmac("sha256", roomSecret()).update(payload).digest();
}

/** Issues a room token bound to one room code and one uid. */
export function issueRoomToken(code: string, uid: string, ttlMs = ROOM_TOKEN_TTL_MS): string {
  const payload: TokenPayload = { c: code, u: uid, e: Date.now() + ttlMs };
  const body = b64url(JSON.stringify(payload));
  return `${PREFIX}${body}.${b64url(hmac(body))}`;
}

/** Verifies a room token against the exact code + uid it must be bound to. */
export function verifyRoomToken(token: unknown, code: string, uid: string): boolean {
  if (typeof token !== "string" || !token.startsWith(PREFIX) || token.length > MAX_TOKEN_LEN)
    return false;
  const dot = token.indexOf(".", PREFIX.length);
  if (dot < 0) return false;
  const body = token.slice(PREFIX.length, dot);
  const sig = token.slice(dot + 1);
  let expected: Buffer;
  let payload: TokenPayload;
  try {
    expected = hmac(body);
    if (sig.length !== expected.toString("base64url").length) return false;
    if (!timingSafeEqual(Buffer.from(sig, "base64url"), expected)) return false;
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
    if (typeof parsed?.c !== "string" || typeof parsed?.u !== "string") return false;
    if (!Number.isFinite(parsed?.e)) return false;
    payload = parsed;
  } catch {
    return false;
  }
  return payload.c === code && payload.u === uid && payload.e > Date.now();
}

/* ---------------- signed-in identity (Supabase bearer) ---------------- */

/**
 * Signed-in people prove who they are with their Supabase access token. The
 * room uid for an account is always `u-<auth.uid>`, so a known email alone
 * gives an attacker nothing anymore.
 *
 * resolveBearer distinguishes "no header" (guest — fine) from "bad header"
 * (reject the request). Verified tokens are cached for 60 s so the 400 ms
 * poll loop never calls Supabase per request.
 */

export type BearerResult = { kind: "none" } | { kind: "ok"; uid: string } | { kind: "bad" };

const bearerCache = new Map<string, { uid: string; exp: number }>();
const BEARER_CACHE_MS = 60_000;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function bearerUidFor(sub: string): string {
  return `u-${sub}`;
}

export async function resolveBearer(req: Request): Promise<BearerResult> {
  const raw = req.headers.get("authorization") ?? "";
  const token = raw.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { kind: "none" };
  if (token.length > 2048) return { kind: "bad" };

  const cached = bearerCache.get(token);
  if (cached && cached.exp > Date.now()) return { kind: "ok", uid: cached.uid };

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { kind: "bad" };
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return { kind: "bad" };

  const uid = bearerUidFor(data.user.id);
  if (bearerCache.size > 1000) bearerCache.clear();
  bearerCache.set(token, { uid, exp: Date.now() + BEARER_CACHE_MS });
  return { kind: "ok", uid };
}
