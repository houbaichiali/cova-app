import { pollSpace } from "@/server/spaces-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Poll fallback for one member: relayed WebRTC signals (ring buffer) plus the
 * live view whenever its fingerprint changed. GET params:
 *   uid    — who is asking
 *   since  — last signal id they received
 *   sig    — last state fingerprint they saw (view only re-sent when changed)
 *
 * This exists because Server-Sent Events are silently swallowed by some
 * proxies (Codespaces port forwarding) — polling plain JSON always works and
 * keeps WebRTC negotiation, live captions and membership updates alive.
 */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const url = new URL(req.url);
  const uid = url.searchParams.get("uid") ?? "";
  const since = Number(url.searchParams.get("since") ?? "0") || 0;
  const sig = url.searchParams.get("sig") ?? "";
  const result = pollSpace(code, uid, since, sig);
  if (!result) {
    // The room is gone, or I was removed / never made it in.
    return Response.json({ ok: true, closed: true });
  }
  return Response.json({ ok: true, ...result });
}
