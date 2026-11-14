import { NextResponse } from "next/server";
import { createSpace, listSpaces, type SpaceKind } from "@/server/spaces-store";
import { resolveBearer } from "@/server/room-token";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const kindOf = (v: unknown): SpaceKind => (v === "group" ? "group" : "voice");

export async function GET(req: Request) {
  const url = new URL(req.url);
  const spaces = listSpaces({
    kind: kindOf(url.searchParams.get("kind")),
    q: url.searchParams.get("q") ?? "",
    mineUid: url.searchParams.get("mine") ?? undefined,
  });
  return NextResponse.json({ spaces });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // Signed-in people prove who they are: the owner identity comes from the
  // verified access token, never from the request body.
  const bearer = await resolveBearer(req);
  if (bearer.kind === "bad") {
    return NextResponse.json({ error: "bad_authorization" }, { status: 401 });
  }
  const ownerUid = bearer.kind === "ok" ? bearer.uid : String(body.uid ?? "").slice(0, 80);
  const result = createSpace({
    kind: kindOf(body.kind),
    name: String(body.name ?? ""),
    description: String(body.description ?? ""),
    isPublic: body.isPublic !== false,
    ownerUid,
  });
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json({ space: result, token: result.token }, { status: 201 });
}
