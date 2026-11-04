/**
 * Round-6 logic checks for the voice rooms, run with plain TypeScript
 * execution (npx tsx scripts/test-round6-logic.ts) — no browser needed.
 *
 * Covers:
 *  1. Ghost-screen fix      — visibleSharers(): a share renders only when the
 *                             client SIGNALED it AND a live stream arrived.
 *  2. Persistent ctl panel  — ctlPanelMode(): the panel exists for everyone;
 *                             the owner's field turns into the code on grant.
 *  3. Late-join sync        — lateJoinPushes(): channel-open pushes share/cam/
 *                             dub state so nobody depends on old broadcasts.
 *  4. Broadcast dubbing     — the speaker never speaks the dub locally, the
 *                             room always does; duck restore stays low while
 *                             a peer is dubbing and returns to 1 when not.
 *  5. Control verification  — ctlVerifyDecision(): exclusive controller.
 */
import {
  visibleSharers,
  ctlPanelMode,
  lateJoinPushes,
  ctlVerifyDecision,
} from "../src/components/voicing/roomControl";
import {
  dubIsOn,
  duckRestoreVolume,
  isBroadcastDub,
  nextFacing,
  shouldRestartRecognition,
} from "../src/components/voicing/dubModel";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string): void {
  if (cond) {
    pass++;
    console.log(`  ok  ${label}`);
  } else {
    fail++;
    console.error(`FAIL  ${label}`);
  }
}
function eq(a: unknown, b: unknown, label: string): void {
  ok(JSON.stringify(a) === JSON.stringify(b), `${label} (got ${JSON.stringify(a)})`);
}

console.log("1) Ghost screen share: only signaled + live shares render");
eq(visibleSharers({}, {}), [], "no signal, no stream -> no overlay");
eq(
  visibleSharers({ a: true }, {}),
  [],
  "signaled but stream missing -> no overlay (no black tile)",
);
eq(
  visibleSharers({}, { a: {} }),
  [],
  "stray track without signal -> no overlay (the old ghost)",
);
eq(
  visibleSharers({ a: true }, { a: {} }),
  ["a"],
  "signaled + live stream -> overlay shows",
);
eq(
  visibleSharers({ a: true, b: true }, { a: {} }),
  ["a"],
  "sharer whose stream ended drops out",
);

console.log("2) Persistent remote-control panel states");
const base = { sharing: false, allowed: false, controlling: null, remoteCtlBy: null, sharer: null };
eq(ctlPanelMode(base), "idle", "nobody shares -> panel still exists (idle: field + hint)");
eq(
  ctlPanelMode({ ...base, sharer: "p1" }),
  "enter",
  "someone shares -> code field for everyone",
);
eq(
  ctlPanelMode({ ...base, sharer: "p1", remoteCtlBy: "p2" }),
  "taken",
  "controller present -> others see who holds it",
);
eq(
  ctlPanelMode({ ...base, controlling: "p1" }),
  "controlling",
  "I hold the control -> status shown",
);
eq(ctlPanelMode({ ...base, sharing: true, allowed: false }), "host-offer", "I share, not granted -> offer");
eq(ctlPanelMode({ ...base, sharing: true, allowed: true }), "host-code", "I granted -> my field became the code");

console.log("3) Late-join state push on control-channel open");
eq(lateJoinPushes({ sharing: false, camOn: false, camFacing: "user", dubOn: false, dubLang: "" }), [], "quiet peer pushes nothing");
eq(
  lateJoinPushes({ sharing: true, camOn: false, camFacing: "user", dubOn: false, dubLang: "" }),
  [{ t: "share", on: true }],
  "sharer pushes share state",
);
eq(
  lateJoinPushes({ sharing: true, camOn: true, camFacing: "environment", dubOn: true, dubLang: "en" }),
  [
    { t: "share", on: true },
    { t: "cam", on: true, facing: "environment" },
    { t: "dub", on: true, lang: "en" },
  ],
  "everything on -> all three pushed in order",
);
eq(
  lateJoinPushes({ sharing: false, camOn: true, camFacing: "user", dubOn: false, dubLang: "" }),
  [{ t: "cam", on: true, facing: "user" }],
  "camera only",
);

console.log("4) Broadcast dubbing direction");
ok(!isBroadcastDub({ tt: undefined, tlang: undefined }), "plain caption is not a broadcast dub");
ok(!isBroadcastDub({ tt: "hello", tlang: undefined }), "tt without tlang is not a dub broadcast");
ok(isBroadcastDub({ tt: "hello", tlang: "en-US" }), "speaker-translated line IS a broadcast dub");
eq(duckRestoreVolume(false), 1, "duck restore: full volume when nobody dubs");
eq(duckRestoreVolume(true), 0.06, "duck restore stays whisper-low while dubbing");
ok(dubIsOn(true, "en") && !dubIsOn(true, "") && !dubIsOn(false, "en"), "dub audible only when listening AND language set");
ok(shouldRestartRecognition("fr", "en", true), "src lang change while listening restarts recognition");
ok(!shouldRestartRecognition("fr", "fr", true), "same lang does not restart");
eq(nextFacing("user"), "environment", "camera flip");

console.log("5) Exclusive control verification");
const host = { allowed: true, code: "123456", controlledBy: null as string | null };
eq(ctlVerifyDecision(host, "v1", "123456"), "grant", "correct code grants");
eq(ctlVerifyDecision(host, "v1", "000000"), "wrong", "wrong code rejected");
eq(
  ctlVerifyDecision({ ...host, controlledBy: "v1" }, "v2", "123456"),
  "busy",
  "second controller is busy even with the right code",
);
eq(
  ctlVerifyDecision({ ...host, controlledBy: "v1" }, "v1", "123456"),
  "grant",
  "the holder re-verifies fine",
);
eq(
  ctlVerifyDecision({ allowed: false, code: null, controlledBy: null }, "v1", "123456"),
  "off",
  "control off -> off (never 'wrong')",
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
