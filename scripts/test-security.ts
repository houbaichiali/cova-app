/**
 * Security round logic checks, run with plain TypeScript execution
 * (npx tsx scripts/test-security.ts) — no browser needed.
 *
 * Covers:
 *  1. Room tokens        — issue/verify, wrong binding, tamper, expiry.
 *  2. Identity takeover  — joining/acting as a member without a token fails;
 *                          with the token works; bearer forces the uid.
 *  3. Moderation safety  — kick/forceMute/deafen require a REAL owner/mod.
 *  4. Flood + payload    — message floods throttled, oversized WebRTC signal
 *                          payloads rejected, join floods throttled.
 *  5. Member-only data   — view/SSE/poll gated by the room token.
 *  6. Room cap           — the in-memory hub cannot grow forever.
 *  7. Security headers   — the CSP/header set is complete and dev-tightened.
 */
import {
  issueRoomToken,
  verifyRoomToken,
  ROOM_TOKEN_TTL_MS,
} from "../src/server/room-token";
import {
  act,
  addListener,
  createSpace,
  getView,
  pollSpace,
  ROOM_CAP,
  SIGNAL_MAX_BYTES,
} from "../src/server/spaces-store";
import { buildSecurityHeaders } from "../src/lib/security-headers";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean): void {
  if (cond) {
    pass++;
    console.log(`  ok    ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}`);
  }
}

/* ---------------- 1. room tokens ---------------- */
console.log("\n[1] room tokens");
{
  const tok = issueRoomToken("ABC123", "u-me");
  check("token issued with rt1 prefix", tok.startsWith("rt1."));
  check("valid token verifies", verifyRoomToken(tok, "ABC123", "u-me"));
  check("wrong room rejected", !verifyRoomToken(tok, "XYZ789", "u-me"));
  check("wrong uid rejected", !verifyRoomToken(tok, "ABC123", "u-other"));
  check("tampered token rejected", !verifyRoomToken(tok.slice(0, -4) + "AAAA", "ABC123", "u-me"));
  check("garbage token rejected", !verifyRoomToken("rt1.bogus.sig", "ABC123", "u-me"));
  check("non-string token rejected", !verifyRoomToken(undefined, "ABC123", "u-me"));
  const stale = issueRoomToken("ABC123", "u-me", -1000);
  check("expired token rejected", !verifyRoomToken(stale, "ABC123", "u-me"));
  check("default ttl is 7 days", ROOM_TOKEN_TTL_MS === 7 * 24 * 60 * 60 * 1000);
}

/* ---------------- 2. identity takeover ---------------- */
console.log("\n[2] identity takeover");
{
  const created = createSpace({
    kind: "voice",
    name: "security room",
    isPublic: true,
    ownerUid: "u-owner",
  });
  if ("error" in created) throw new Error("room setup failed");
  const code = created.code;

  check("create returns a signed owner token", verifyRoomToken(created.token, code, "u-owner"));

  const first = act(code, { type: "join", uid: "u-owner", name: "Owner" });
  check("fresh join works without token", first.ok);
  const ownerTok = first.ok ? first.token! : "";
  check("join issues a valid token", verifyRoomToken(ownerTok, code, "u-owner"));

  const steal = act(code, { type: "join", uid: "u-owner", name: "Impostor" });
  check(
    "joining a taken uid WITHOUT token -> uid_taken",
    !steal.ok && steal.error === "uid_taken",
  );

  const rejoin = act(code, { type: "join", uid: "u-owner", t: ownerTok });
  check("rejoining with the token works", rejoin.ok);

  const msg = act(code, { type: "message", uid: "u-owner", text: "hi" });
  check("member action without token -> no_token", !msg.ok && msg.error === "no_token");
  const msg2 = act(code, { type: "message", uid: "u-owner", text: "hi", t: ownerTok });
  check("member action with token works", msg2.ok);

  // Bearer-forced identity (signed-in account).
  const mismatch = act(code, { type: "message", uid: "u-victim", text: "x" }, "u-owner");
  check("bearer uid mismatch -> uid_mismatch", !mismatch.ok && mismatch.error === "uid_mismatch");
  const waiver = act(code, { type: "join", uid: "u-owner" }, "u-owner");
  check("verified bearer waives the room token", waiver.ok);
}

/* ---------------- 3. moderation safety ---------------- */
console.log("\n[3] moderation safety");
{
  const created = createSpace({ kind: "voice", name: "mod room", isPublic: true, ownerUid: "u-boss" });
  if ("error" in created) throw new Error("room setup failed");
  const code = created.code;
  const o1 = act(code, { type: "join", uid: "u-boss" });
  const oTok = o1.ok ? o1.token! : "";
  const guest = act(code, { type: "join", uid: "g-guest", name: "Guest" });
  const gTok = guest.ok ? guest.token! : "";

  const fakeKick = act(code, { type: "kick", uid: "u-boss", target: "g-guest" });
  check(
    "kick with a CLAIMED owner uid and no token -> no_token",
    !fakeKick.ok && fakeKick.error === "no_token",
  );
  const realKick = act(code, { type: "kick", uid: "u-boss", target: "g-guest", t: oTok });
  check("kick with the REAL owner token works", realKick.ok);
  const back = act(code, { type: "join", uid: "g-guest", t: gTok });
  check("kicked person is banned from rejoining", !back.ok && back.error === "banned");
  const unban = act(code, { type: "unban", uid: "u-boss", target: "g-guest", t: oTok });
  check("owner can allow back with token", unban.ok);

  const g2 = act(code, { type: "join", uid: "g-guest", t: gTok });
  check("guest back in after unban", g2.ok);
  const fakeMute = act(code, { type: "forceMute", uid: "g-guest", target: "u-boss", t: gTok });
  check("non-mod forceMute -> forbidden", !fakeMute.ok && fakeMute.error === "forbidden");
  const fakeDeafen = act(code, { type: "deafen", uid: "g-guest", target: "u-boss", t: gTok });
  check("non-mod deafen -> forbidden", !fakeDeafen.ok && fakeDeafen.error === "forbidden");
}

/* ---------------- 4. flood + payload caps ---------------- */
console.log("\n[4] flood + payload caps");
{
  const created = createSpace({ kind: "voice", name: "flood room", isPublic: true, ownerUid: "u-f" });
  if ("error" in created) throw new Error("room setup failed");
  const code = created.code;
  const ownerJoin = act(code, { type: "join", uid: "u-f" });
  check("signal recipient (owner) is in the room", ownerJoin.ok);
  const j = act(code, { type: "join", uid: "g-spam" });
  const tok = j.ok ? j.token! : "";

  const big = "x".repeat(SIGNAL_MAX_BYTES + 100);
  const sig = act(code, { type: "signal", uid: "g-spam", to: "u-f", payload: { sdp: big }, t: tok });
  check("oversized signal payload rejected", !sig.ok && sig.error === "payload_too_large");
  const okSig = act(code, { type: "signal", uid: "g-spam", to: "u-f", payload: { sdp: "tiny" }, t: tok });
  check("normal signal payload accepted", okSig.ok);

  let floodedSeen = false;
  for (let i = 0; i < 25; i++) {
    const r = act(code, { type: "message", uid: "g-spam", text: `m${i}`, t: tok });
    if (!r.ok && r.error === "rate_limited") floodedSeen = true;
  }
  check("message flood hits the per-person throttle", floodedSeen);

  const privateRoom = createSpace({ kind: "voice", name: "gate", isPublic: false, ownerUid: "u-gate" });
  if ("error" in privateRoom) throw new Error("room setup failed");
  const pCode = privateRoom.code;
  const firstJoin = act(pCode, { type: "join", uid: "g-knock", name: "Knock" });
  const kTok = firstJoin.ok ? firstJoin.token! : "";
  check("private room join -> pending with token", firstJoin.ok && firstJoin.view.status === "pending");
  let joinFlood = false;
  for (let i = 0; i < 10; i++) {
    const r = act(pCode, { type: "join", uid: "g-knock", t: kTok });
    if (!r.ok && r.error === "rate_limited") joinFlood = true;
  }
  check("join flood hits the per-person throttle", joinFlood);
}

/* ---------------- 5. member-only data ---------------- */
console.log("\n[5] member-only data");
{
  const created = createSpace({ kind: "voice", name: "view room", isPublic: true, ownerUid: "u-view" });
  if ("error" in created) throw new Error("room setup failed");
  const code = created.code;
  const joined = act(code, { type: "join", uid: "g-member", name: "Member" });
  const tok = joined.ok ? joined.token! : "";
  const ownerJoined = act(code, { type: "join", uid: "u-view" });
  const viewTok = ownerJoined.ok ? ownerJoined.token! : "";

  const stolen = getView(code, "g-member");
  check(
    "member view WITHOUT token hides everything",
    !!stolen && stolen.status === "none" && stolen.members.length === 0 && stolen.messages.length === 0,
  );
  const real = getView(code, "g-member", tok);
  check("member view WITH token shows the room", !!real && real.status === "member" && real.members.length === 2);

  const outsider = getView(code, "g-stranger");
  check(
    "non-member uid sees only the public summary",
    !!outsider && outsider.status === "none" && outsider.members.length === 0 && outsider.name === "view room",
  );

  const noStream = addListener(code, "g-member", () => {});
  check("SSE without token -> no stream", noStream === null);
  const stream = addListener(code, "g-member", () => {}, tok);
  check("SSE with token -> stream opens", typeof stream === "function");
  stream?.();

  const noPoll = pollSpace(code, "g-member", 0, "");
  check("poll without token -> closed", noPoll === null);
  const yesPoll = pollSpace(code, "g-member", 0, "", tok);
  check("poll with token -> live", !!yesPoll && yesPoll.closed === false);

  // Signal relay is member-only and lands in the recipient's buffer.
  act(code, { type: "signal", uid: "u-view", to: "g-member", payload: { sdp: "offer" }, t: viewTok });
  const polled = pollSpace(code, "g-member", 0, "", tok);
  check("relayed signal arrives for the token holder", !!polled && polled.signals.length === 1);
}

/* ---------------- 6. room cap ---------------- */
console.log("\n[6] room cap");
{
  let capped = false;
  for (let i = 0; i < ROOM_CAP + 10; i++) {
    const r = createSpace({ kind: "voice", name: `bulk ${i}`, isPublic: true, ownerUid: "u-bulk" });
    if ("error" in r && r.error === "too_many_spaces") {
      capped = true;
      break;
    }
  }
  check(`hub refuses rooms beyond ROOM_CAP (${ROOM_CAP})`, capped);
}

/* ---------------- 7. security headers ---------------- */
console.log("\n[7] security headers");
{
  const prod = buildSecurityHeaders(false);
  const dev = buildSecurityHeaders(true);
  check("CSP present", !!prod["Content-Security-Policy"]);
  check("frame-ancestors 'none' (clickjacking closed)", prod["Content-Security-Policy"].includes("frame-ancestors 'none'"));
  check("object-src 'none'", prod["Content-Security-Policy"].includes("object-src 'none'"));
  check("base-uri 'self'", prod["Content-Security-Policy"].includes("base-uri 'self'"));
  check("scripts self+inline in prod", prod["Content-Security-Policy"].includes("script-src 'self' 'unsafe-inline'"));
  check("no unsafe-eval in prod", !prod["Content-Security-Policy"].includes("unsafe-eval"));
  check("unsafe-eval only in dev", dev["Content-Security-Policy"].includes("unsafe-eval"));
  check("supabase endpoints allowed for realtime", prod["Content-Security-Policy"].includes("wss://*.supabase.co"));
  check("X-Frame-Options DENY", prod["X-Frame-Options"] === "DENY");
  check("nosniff", prod["X-Content-Type-Options"] === "nosniff");
  check("referrer policy", prod["Referrer-Policy"] === "strict-origin-when-cross-origin");
  check("HSTS one year", prod["Strict-Transport-Security"].includes("max-age=31536000"));
  check("mic/camera self-only", prod["Permissions-Policy"].includes("microphone=(self)") && prod["Permissions-Policy"].includes("camera=(self)"));
  check("geolocation closed", prod["Permissions-Policy"].includes("geolocation=()"));
}

console.log(`\n=== security logic: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
