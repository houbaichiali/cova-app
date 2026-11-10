import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STUN: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:global.stun.twilio.com:3478"] },
];

/**
 * ICE configuration for the voice mesh.
 *
 * WebRTC between a PC and a phone on DIFFERENT networks needs a TURN relay.
 * The old hardcoded openrelay.metered.ca is DEAD (its DNS now answers with
 * documentation-only addresses), which made cross-network calls fail with
 * total silence: no audio, no camera, no screen share, no remote control.
 *
 * Set these environment variables with ANY TURN provider (Cloudflare Realtime
 * TURN has a free tier, Metered gives 20 GB/month, or run your own coturn):
 *   COVA_TURN_URLS        e.g. "turn:standard.relay.metered.ca:80" or a
 *                         comma-separated list with ?transport=tcp variants
 *   COVA_TURN_USERNAME    the username / key id
 *   COVA_TURN_CREDENTIAL  the credential / secret
 *
 * Without them the client still works on the same network and over simple
 * NATs through STUN, and the mesh's ICE-restart recovery keeps retrying while
 * a relay appears.
 */
export async function GET() {
  const urls = (process.env.COVA_TURN_URLS ?? "").trim();
  const username = (process.env.COVA_TURN_USERNAME ?? "").trim();
  const credential = (process.env.COVA_TURN_CREDENTIAL ?? "").trim();
  const servers = [...STUN];
  if (urls && username && credential) {
    servers.push({ urls: urls.split(",").map((u) => u.trim()).filter(Boolean), username, credential });
  }
  return NextResponse.json(
    { iceServers: servers },
    { headers: { "Cache-Control": "no-store" } },
  );
}
