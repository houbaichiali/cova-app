# COVA Security

How this application protects itself, layer by layer. Everything listed here is
**implemented in the codebase and covered by automated checks**
(`scripts/test-security.ts` + the three older logic suites + typecheck + build).

## Layers

### 1. Edge protection — `src/proxy.ts` (Next.js 16 proxy file)

Runs before every request:

- **Security headers on every response** (built by `src/lib/security-headers.ts`):
  - `Content-Security-Policy` — `default-src 'self'`, scripts/styles/images/fonts
    locked to self (Supabase endpoints whitelisted for realtime), `object-src 'none'`,
    `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'` (clickjacking),
    `upgrade-insecure-requests`.
  - `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
    `Referrer-Policy: strict-origin-when-cross-origin`.
  - `Permissions-Policy` — camera/microphone/display-capture self-only (voice rooms
    need them), geolocation/payment/usb off.
  - `Strict-Transport-Security` (1 year), COOP `same-origin-allow-popups`, CORP.
- **Cross-origin (CSRF) block** — browser `POST/PUT/PATCH/DELETE` calls whose
  `Origin` does not match the deployment host get `403 cross_origin_blocked`.
- **Per-IP rate limiting** on `/api/*` — sliding 60 s windows per route class
  (room polling 900/min, actions 600/min, quiz 300/min, ICE 60/min, admin 60/min,
  translate 120/min, default 300/min). Floods get `429` + `Retry-After`.

### 2. Room identity — `src/server/room-token.ts` + `src/server/spaces-store.ts`

The voice/group room hub used to trust a client-claimed `uid` (signed-in uids
were even derived from the email). An attacker who knew an email could claim the
owner's identity, kick/deafen everyone, or read a private room. Fixed with two
server-enforced proofs:

- **Signed room tokens** — on join/create the server issues
  `rt1.<payload>.<HMAC-SHA256>` bound to the exact room code + uid, 7-day TTL,
  re-issued on every action. Every member action, member view, SSE stream and
  poll must carry it. A claimed uid alone now returns `uid_taken` / `no_token`
  and a member view without the token is the public summary only.
- **Verified bearer identity** — signed-in accounts send their Supabase access
  token; the server resolves it with `auth.getUser` (60 s cache) and FORCES
  `uid = u-<auth.uid>`. A uid mismatch is `403 uid_mismatch`; the bearer also
  waives the room token for re-joins from a second device.

### 3. Abuse caps in the room hub

- WebRTC signal payloads are rejected above **20 KB** (`payload_too_large`) —
  SDP answers are a few KB; abuse is not.
- Per-person sliding throttles: join 8/min, messages 20/min, captions 40/min,
  signals 150/min (`rate_limited`).
- The in-memory hub caps rooms at **200** (`too_many_spaces`).

### 4. Admin safety — `src/server/admin.ts` + `/api/admin/*`

- Server-side gate only: Supabase access token → `auth.getUser` → security-definer
  RPC `admin_my_access` → admin flag, **mandatory MFA**, per-permission check.
  No client-side state can grant admin rights.
- `/api/admin/ban` validates strict input shape (UUID + real boolean).
- `SUPABASE_SERVICE_ROLE_KEY` lives in server env only and is never prefixed
  `NEXT_PUBLIC_`.

### 5. Quiz sessions — `src/server/quiz-store.ts` + API routes

- Every session route resolves the caller from the Supabase bearer token.
- Host-only actions (start/reveal/next/end/kick) compare against the stored host id.
- Quiz authorship checked before a session can be hosted.
- The live SSE stream refuses anyone who is not the host or a joined player.

### 6. Database — Supabase RLS

- Row Level Security enabled across the social schema, messages, calls
  (`call_signals` is authenticated-only with owner/recipient policies), storage
  buckets (authenticated inserts, owner deletes, public reads for shared media).
- The browser ships only the anon/publishable key — every request is RLS-scoped.

### 7. Account deletion — `supabase/functions/delete-account`

Edge function verifies the caller's access token before the admin-API deletion;
the service key is a server secret.

### 8. Dependency hygiene

- `npm audit` clean at **0 vulnerabilities including dev dependencies**
  (Next.js pinned to the patched 16.4.6 — a critical RCE in `use cache` and an
  App Router DoS advisory are closed by the bump).
- The `zod` memory-exhaustion advisory (HIGH, GHSA-mrhx-c7xc-m3w5) is patched;
  the dev-only `minimatch` advisory inside the `typescript-eslint` toolchain is
  closed with a scoped `overrides` entry in `package.json` (11.0.8, the patched
  release — upstream `typescript-eslint` has no fixed version yet). Other
  packages keep their own compatible `minimatch` 3.x untouched.
- No secrets in the repo (scanned); no `dangerouslySetInnerHTML` / `eval` /
  `innerHTML` anywhere (React escaping everywhere).

## What an attacker cannot do anymore

1. Impersonate another person in a room by claiming their uid (needs their token,
   or their device's Supabase session).
2. Become a room owner/moderator without holding that role server-side.
3. Read member lists, chat, captions or WebRTC signals of a room they are not in.
4. Join a private room by claiming the owner's identity.
5. Flood rooms (signals/messages/captions/joins) or the API in general.
6. Clickjack the app, MIME-sniff responses, or frame it elsewhere.
7. Call admin endpoints without an MFA-verified admin session.

## Honest limits

- The room hub is in-memory and single-instance by design; the rate limiter is
  per server instance. For a multi-instance deployment set `COVA_ROOM_SECRET`
  (32+ chars) and put a shared limiter in front.
- Guests prove identity with the per-browser random uid + room token; the
  strongest identity comes from signing in with a real account.
- CSP keeps `script-src 'unsafe-inline'` because statically prerendered pages
  cannot carry a per-request nonce; the XSS surface is closed by React escaping
  plus zero raw-HTML sinks (verified).
- Storage bucket inserts are authenticated but not folder-scoped per user —
  organizational hygiene, not a content risk (public-read bucket by design).

## Verification commands

```bash
bun scripts/test-security.ts        # 54 security logic checks
bun scripts/test-round6-logic.ts    # 29 voice-room logic checks
bun scripts/test-dubbing-logic.ts   # 66 dubbing/caption checks
bun scripts/test-xp-levels.ts       # 29 XP checks
npm run typecheck && npm run build  # full type + production build
npm audit --omit=dev                # dependency advisories
```
