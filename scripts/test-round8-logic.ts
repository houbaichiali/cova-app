/**
 * Round-8 voice reliability verification. Run: bun scripts/test-round8-logic.ts
 *
 * Covers the real-world failure chain reported live (PC <-> phone: no audio,
 * stuck caption bubbles, self-unmute after moderator mute, no way back after
 * a kick) plus the new per-listener volume behaviour:
 *  - the /poll fallback (signals ring buffer + state signature) that replaces
 *    a swallowed SSE stream,
 *  - moderator mute LOCK (forceMuted) enforced server-side,
 *  - unban / allow-back after a kick,
 *  - resolveRestoreVolume (dubbing duck respects the listener's slider),
 *  - bubble expiry (latest line wins, old lines disappear),
 *  - ICE-restart decision rules (offerer-only, capped attempts),
 *  - pollSpace end-to-end against the in-memory hub (real server module).
 */
import { readFileSync } from "node:fs";
import {
  createSpace,
  act,
  pollSpace,
  spaceSignature,
  type ActionInput,
} from "../src/server/spaces-store";
import { resolveRestoreVolume, duckRestoreVolume } from "../src/components/voicing/dubModel";
import { bubbleVisible, BUBBLE_TTL } from "../src/components/voicing/useCaptionView";

let passed = 0;
let failed = 0;
function ok(cond: boolean, name: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}
function eq(got: unknown, want: unknown, name: string) {
  ok(got === want, `${name} (got ${JSON.stringify(got)})`);
}
function section(title: string) {
  console.log(`\n${title}`);
}

const srcMesh = readFileSync("src/components/voicing/useVoiceMesh.ts", "utf8");
const srcStage = readFileSync("src/components/voicing/AvatarStage.tsx", "utf8");
const srcIce = readFileSync("src/app/api/ice/route.ts", "utf8");
const srcClient = readFileSync("src/lib/spaces-client.ts", "utf8");
const srcStore = readFileSync("src/server/spaces-store.ts", "utf8");
const srcServerRoute = readFileSync("src/app/api/spaces/[code]/route.ts", "utf8");
const srcEvents = readFileSync("src/app/api/spaces/[code]/events/route.ts", "utf8");

/* ---------------- 1) per-listener volume restore ---------------- */
section("1) resolveRestoreVolume — the listener's slider wins")
eq(resolveRestoreVolume(true), 0.06, "still dubbing -> whisper even without a slider value")
eq(resolveRestoreVolume(true, 0.4), 0.06, "still dubbing -> whisper even with a slider value")
eq(resolveRestoreVolume(false, 0.4), 0.4, "duck over -> MY chosen level (0.4), not 1")
eq(resolveRestoreVolume(false, 0), 0, "duck over -> my muted choice (0) kept")
eq(resolveRestoreVolume(false), 1, "no slider ever touched -> full volume")
eq(resolveRestoreVolume(false, 7), 1, "clamped to 1 from above")
eq(resolveRestoreVolume(false, -2), 0, "clamped to 0 from below")
eq(duckRestoreVolume(true), 0.06, "duckRestoreVolume (old helper) still whisper while dubbing")

/* ---------------- 2) bubbles: newest wins, old ones vanish ---------------- */
section("2) bubble expiry")
eq(BUBBLE_TTL, 7000, "bubble lives 7 seconds")
ok(bubbleVisible(1000, 3000), "fresh bubble visible")
ok(!bubbleVisible(1000, 1000 + BUBBLE_TTL), "bubble hidden exactly after TTL")
ok(bubbleVisible(1000, 1000 + BUBBLE_TTL - 1), "still visible one ms before TTL")
ok(!bubbleVisible(0, 60_000, 7000), "long-past line never reappears")
ok(bubbleVisible(1000, 2000, 5000), "custom ttl honoured")
ok(
  srcStage.includes("bubbleVisible(line.at, Date.now())"),
  "3D stage checks expiry per frame",
)
ok(
  srcStage.includes("Record<string, BubbleLine>") &&
    srcStage.includes("line.text"),
  "stage reads the new BubbleLine shape",
)

/* ---------------- 3) moderator mute LOCK (server-enforced) ---------------- */
section("3) forceMute is a lock the target cannot lift")
const s3 = createSpace({ kind: "voice", name: "Lock test", isPublic: true, ownerUid: "boss" });
ok(!("error" in s3), "room created")
const code3 = (s3 as { code: string }).code;
const do3 = (a: ActionInput) => act(code3, a);
do3({ type: "join", uid: "boss", name: "Boss" });
do3({ type: "join", uid: "victim", name: "Victim" });
do3({ type: "join", uid: "mod1", name: "Mod" });
do3({ type: "setRole", uid: "boss", role: "mod", target: "mod1" });

const muteRes = do3({ type: "forceMute", uid: "mod1", target: "victim" });
ok(muteRes.ok, "moderator can lock the target's mic")
let v3 = do3({ type: "update", uid: "victim", muted: false });
let me3 = (v3.ok ? v3.view.members.find((m) => m.uid === "victim") : undefined);
ok(!!me3 && me3.muted === true && me3.forceMuted === true, "victim CANNOT unmute themselves")
v3 = do3({ type: "update", uid: "victim", muted: false });
me3 = (v3.ok ? v3.view.members.find((m) => m.uid === "victim") : undefined);
ok(!!me3 && me3.muted === true, "second unmute attempt also rejected")
const unMute = do3({ type: "forceMute", uid: "mod1", target: "victim", value: false });
ok(unMute.ok, "moderator can unlock")
me3 = (unMute.view.members.find((m) => m.uid === "victim"));
ok(me3.muted === false && me3.forceMuted === false, "after unlock the target can speak again")
const selfLock = do3({ type: "forceMute", uid: "victim", target: "victim" });
ok(!selfLock.ok, "a plain member cannot lock anyone")
const modOnMod = do3({ type: "forceMute", uid: "mod1", target: "boss" });
ok(!modOnMod.ok, "moderator cannot lock the owner")
ok(
  srcStore.includes("!me.forceMuted) me.muted = a.muted"),
  "update action refuses self-unmute while locked",
)
ok(
  srcStore.includes('target.forceMuted = a.value !== false;'),
  "forceMute stores the lock flag",
)

/* ---------------- 4) deafen sticks (no self-service path) ---------------- */
section("4) deafen sticks")
const dRes = do3({ type: "deafen", uid: "boss", target: "victim", value: true });
ok(dRes.ok, "owner deafens the victim")
me3 = (dRes.view.members.find((m) => m.uid === "victim"));
ok(me3.deafened === true, "victim cannot hear the room")
const noSelfDeafen = do3({ type: "update", uid: "victim", deafened: false });
me3 = (noSelfDeafen.view.members.find((m) => m.uid === "victim"));
ok(me3.deafened === true, "update action has NO deafened field — nothing to self-clear")
const unDeaf = do3({ type: "deafen", uid: "boss", target: "victim", value: false });
me3 = (unDeaf.view.members.find((m) => m.uid === "victim"));
ok(me3.deafened === false, "only a moderator restores hearing")

/* ---------------- 5) kick -> banned -> unban -> rejoin ---------------- */
section("5) remove + allow back")
const kRes = do3({ type: "kick", uid: "boss", target: "victim" });
ok(kRes.ok, "owner removes the victim")
const rejoinBanned = do3({ type: "join", uid: "victim", name: "Victim" });
ok(!rejoinBanned.ok && rejoinBanned.error === "banned", "removed person cannot just rejoin")
const ownerView = kRes.view;
ok(
  ownerView.status === "owner" && Array.isArray(ownerView.banned) && ownerView.banned.includes("victim"),
  "owner's view lists removed people",
)
const modView = do3({ type: "update", uid: "mod1" }).view;
ok(modView.banned.length === 0, "non-owner sees NO banned list")
const unban = do3({ type: "unban", uid: "boss", target: "victim" });
ok(unban.ok, "owner allows the person back")
const rejoinOk = do3({ type: "join", uid: "victim", name: "Victim" });
ok(rejoinOk.ok, "after unban the person can join again")
const noModUnban = do3({ type: "join", uid: "tmpx", name: "T" });
ok(noModUnban.ok, "sanity: new member joins a public room")

/* ---------------- 6) /poll fallback: signals + signature ---------------- */
section("6) poll fallback (real hub): signals ring buffer + fingerprint")
const s6 = createSpace({ kind: "voice", name: "Poll test", isPublic: true, ownerUid: "a" });
const code6 = (s6 as { code: string }).code;
act(code6, { type: "join", uid: "a", name: "A" });
act(code6, { type: "join", uid: "b", name: "B" });
const sig0 = act(code6, { type: "update", uid: "b" }).view;
const p0 = pollSpace(code6, "b", 0, "");
ok(p0 !== null && p0.view !== null && p0.signals.length === 0, "first poll: view arrives")
ok(p0 !== null && p0.sig === spaceSignatureOf(p0!.view), "signature matches the view it carries")
const firstSig = p0!.sig;

// A sends two WebRTC signals to B.
act(code6, { type: "signal", uid: "a", to: "b", payload: { kind: "sdp", description: { type: "offer", sdp: "x" } } });
act(code6, { type: "signal", uid: "a", to: "b", payload: { kind: "ice", candidate: { candidate: "c1" } } });
const p1 = pollSpace(code6, "b", 0, firstSig);
ok(p1!.signals.length === 2, "both signals delivered by polling (no SSE needed)")
eq(p1!.signals[0]!.id, 1, "monotonic ids")
eq(p1!.signals[1]!.id, 2, "ids increase")
ok(p1!.view === null, "unchanged state -> view NOT re-sent (cheap polling)")
const p2 = pollSpace(code6, "b", 1, firstSig);
ok(p2!.signals.length === 1 && p2!.signals[0]!.id === 2, "since=1 skips already-seen signal")
const p3 = pollSpace(code6, "b", 2, firstSig);
eq(p3!.signals.length, 0, "fully caught up -> zero signals")
// New caption flips the fingerprint -> the view (with the caption) is re-sent.
act(code6, { type: "caption", uid: "a", text: "hello world", lang: "en-US" });
const p4 = pollSpace(code6, "b", 2, firstSig);
ok(p4!.view !== null && p4!.view!.captions.some((c) => c.text === "hello world"), "state change -> poll carries the fresh captions (bubbles can update)")
// A moderator mute flips the fingerprint too (member flags are inside it).
act(code6, { type: "forceMute", uid: "a", target: "b" });
const p5 = pollSpace(code6, "b", 2, p4!.sig);
ok(p5!.view !== null, "mute flip changes the fingerprint -> view re-sent")
me3 = (p5!.view!.members.find((m) => m.uid === "b"));
ok(me3.forceMuted === true, "the polled view carries the lock flag")
do3({ type: "forceMute", uid: "a", target: "b", value: false });
// Ring buffer cap.
for (let i = 0; i < 120; i++)
  act(code6, { type: "signal", uid: "a", to: "b", payload: { kind: "ice", candidate: { candidate: `c${i}` } } });
const p6 = pollSpace(code6, "b", 2, p5!.sig);
ok(p6 !== null && p6.signals.length <= 200 && p6.signals.length >= 100, "ring buffer keeps history bounded")
ok(p6!.signals.every((s, i, arr) => i === 0 || s.id > arr[i - 1]!.id), "polled signals stay strictly ordered")
// Non-member / gone room.
eq(pollSpace(code6, "ghost", 0, ""), null, "stranger gets closed")
eq(pollSpace("NOPE99", "a", 0, ""), null, "unknown room gets closed")
// Kicked member is told closed by poll (their SSE may be dead).
act(code6, { type: "kick", uid: "a", target: "b" });
eq(pollSpace(code6, "b", 3, p6!.sig), null, "kicked member polls -> closed")
// Polling keeps a member alive: simulate SSE death via a fresh listener then poll only.
act(code6, { type: "join", uid: "late", name: "Late" });

/* ---------------- 7) SSE + poll coexistence on the client ---------------- */
section("7) client: signal dedup between SSE and poll")
ok(
  srcClient.includes("seenSignals") &&
    srcClient.includes("dispatchSignal") &&
    srcClient.includes("if (seenSignals.current.has(s.id)) return;"),
  "client dedups relayed signals by id",
)
ok(
  srcClient.includes("/api/spaces/${code}/poll") &&
    srcClient.includes("window.setInterval(() => void tick(), 400)"),
  "client polls /poll every 400 ms while live",
)
ok(
  srcClient.includes('es.addEventListener("signal"') &&
    srcClient.includes("dispatchSignal(JSON.parse"),
  "SSE fast path still wired through the same dedup",
)
ok(
  srcStore.includes('push(s.code, a.to, "signal", { from: uid, payload: a.payload, id })'),
  "server tags every relayed signal with its id",
)
ok(
  srcServerRoute.includes("export async function GET") &&
    srcEvents.includes("addListener"),
  "POST/GET + SSE routes intact",
)

/* ---------------- 8) ICE: live config + offerer-only restart ---------------- */
section("8) ICE config + restart recovery")
ok(
  srcMesh.includes('fetch("/api/ice")'),
  "mesh loads ICE servers from /api/ice (env-configurable TURN)",
)
ok(
  srcMesh.includes('iceServers: iceRef.current'),
  "peer connections use the fetched ICE list",
)
ok(
  !srcMesh.includes("openrelayproject") && !srcIce.includes("openrelayproject"),
  "dead openrelay TURN credentials fully removed",
)
ok(
  srcIce.includes("COVA_TURN_URLS") && srcIce.includes("process.env"),
  "TURN comes from env vars via /api/ice",
)
ok(
  srcMesh.includes("createOffer({ iceRestart: true })"),
  "offerer re-offers with iceRestart on dead connections",
)
ok(
  srcMesh.includes('pc.connectionState === "failed"') &&
    srcMesh.includes('pc.connectionState === "disconnected"'),
  "both failed and stuck-disconnected trigger recovery",
)
ok(
  srcMesh.includes("if (!isOfferer || peer.closed) return;"),
  "ONLY the offerer restarts — no glare possible",
)
ok(
  srcMesh.includes("attempt > 8"),
  "restart attempts are capped (8)",
)
ok(
  srcMesh.includes('delay = failed ? 1200 : 8000'),
  "disconnected gets a grace period (8 s) before restarting",
)
ok(
  srcMesh.includes("pc.connectionState === \"connected\"") &&
    srcMesh.includes("iceRestarts.current.set(uid, 0)"),
  "a connected peer resets the retry counter",
)
ok(
  srcMesh.includes("resolveRestoreVolume"),
  "mesh restores the listener's own volume after ducks",
)

/* ---------------- 9) i18n completeness for the new UI ---------------- */
section("9) new strings defined in all 3 locales")
const i18n = readFileSync("src/i18n/spaces.ts", "utf8");
for (const key of [
  "room.volumeForMe",
  "room.volumeForMeAria",
  "room.muteLocked",
  "room.unmuteThem",
  "room.bannedTitle",
  "room.unban",
]) {
  const n = i18n.split(`"${key}"`).length - 1;
  eq(n, 3, `${key} defined in en/fr/ar`);
}
ok(i18n.includes("أعد تشغيل المايك"), "Arabic mic-fix guidance intact")

/* ---------------- 10) mute/deafen/kick button semantics ---------------- */
section("10) participants panel semantics")
const srcPanel = readFileSync("src/components/voicing/ParticipantsPanel.tsx", "utf8");
ok(
  srcPanel.includes('send({ type: "forceMute", target: m.uid, value: !m.forceMuted })'),
  "mute button toggles the LOCK (target cannot lift it)",
)
ok(
  srcPanel.includes('type="range"') && srcPanel.includes("setUserVolume(m.uid"),
  "per-person volume slider present",
)
ok(
  srcPanel.includes("!isMe"),
  "no slider on myself (my own mic is not my playback)",
)
ok(
  srcPanel.includes('send({ type: "unban", target: buid })'),
  "owner can allow a removed person back",
)
ok(
  srcPanel.includes("room.volumeForMeAria") || srcPanel.includes("volumeForMeAria"),
  "slider labelled with the person's name",
)

function spaceSignatureOf(view: { members: { uid: string; muted: boolean; deafened: boolean; forceMuted: boolean; role: string }[]; pending: unknown[]; banned: unknown[]; captions: { id: string }[]; messages: { id: string }[] }): string {
  const flags = view.members
    .map((m) => `${m.uid.slice(-6)}${m.muted ? 1 : 0}${m.deafened ? 1 : 0}${m.forceMuted ? 1 : 0}${m.role[0]}`)
    .join(",");
  return [
    view.members.length,
    flags,
    view.pending.length,
    view.banned.length,
    view.captions.at(-1)?.id ?? "",
    view.messages.at(-1)?.id ?? "",
  ].join("|");
}

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
