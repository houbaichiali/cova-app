import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildSecurityHeaders } from "@/lib/security-headers";

/**
 * COVA edge protection (Next.js 16 proxy file — the renamed middleware).
 *
 * Every response leaves with the full security-header set; every /api request
 * passes an origin check (cross-site POST = CSRF) and a per-IP sliding-window
 * rate limit (flood / brute-force). The per-IP limiter is in-memory, i.e.
 * per server instance — the supported deployment is a single Node process,
 * same as the room hub itself.
 */

const isDev = process.env.NODE_ENV !== "production";
const HEADERS = buildSecurityHeaders(isDev);

/* ---------------------------- rate limiting ---------------------------- */

const WINDOW_MS = 60_000;
const MAX_TRACKED = 10_000;

/** Requests per minute per IP for each route class. */
const LIMITS: Record<string, number> = {
  poll: 900, // 400 ms room polling = 150/min per member; NAT'd rooms share an IP
  events: 60, // SSE (re)connects
  act: 600, // room actions incl. WebRTC signal relay bursts
  spacesList: 120,
  spaceCreate: 30,
  quiz: 300,
  translate: 120, // the route itself also keeps a stricter 60/min
  ice: 60,
  admin: 60,
  apiDefault: 300,
};

function classify(path: string): string {
  if (/^\/api\/spaces\/[^/]+\/poll$/.test(path)) return "poll";
  if (/^\/api\/spaces\/[^/]+\/events$/.test(path)) return "events";
  if (/^\/api\/spaces\/[^/]+$/.test(path)) return "act";
  if (path === "/api/spaces") return "spacesList";
  if (/^\/api\/quiz\//.test(path)) return "quiz";
  if (path === "/api/translate") return "translate";
  if (path === "/api/ice") return "ice";
  if (/^\/api\/admin\//.test(path)) return "admin";
  return "apiDefault";
}

const hits = new Map<string, Map<string, { n: number; resetAt: number }>>();

function tooMany(ip: string, cls: string): boolean {
  const limit = LIMITS[cls] ?? LIMITS.apiDefault ?? 300;
  const now = Date.now();
  if (hits.size > MAX_TRACKED) hits.clear();
  let byCls = hits.get(ip);
  if (!byCls) hits.set(ip, (byCls = new Map()));
  let entry = byCls.get(cls);
  if (!entry || entry.resetAt < now) {
    entry = { n: 0, resetAt: now + WINDOW_MS };
    byCls.set(cls, entry);
  }
  entry.n += 1;
  return entry.n > limit;
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local"
  );
}

/* --------------------------- origin / CSRF ---------------------------- */

/** Same-origin proof for state-changing requests (browsers always send Origin on POST). */
function crossOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false; // server-to-server / curl — not a browser CSRF vector
  try {
    const originHost = new URL(origin).host;
    const forwarded = req.headers.get("x-forwarded-host");
    const host = forwarded?.split(",")[0]?.trim() || req.headers.get("host") || "";
    return !!host && originHost !== host;
  } catch {
    return true;
  }
}

function withHeaders(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(HEADERS)) res.headers.set(k, v);
  return res;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const mutating = req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS";

  if (isApi) {
    if (mutating && crossOrigin(req)) {
      const res = NextResponse.json({ error: "cross_origin_blocked" }, { status: 403 });
      for (const [k, v] of Object.entries(HEADERS)) res.headers.set(k, v);
      return res;
    }
    if (tooMany(clientIp(req), classify(pathname))) {
      const res = NextResponse.json(
        { error: "rate_limited" },
        { status: 429, headers: { "Retry-After": "60" } },
      );
      for (const [k, v] of Object.entries(HEADERS)) res.headers.set(k, v);
      return res;
    }
  }

  return withHeaders(NextResponse.next());
}

export const config = {
  // Everything except Next's own static assets and the favicon set.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
