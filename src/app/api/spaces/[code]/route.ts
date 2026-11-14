import { NextResponse } from "next/server";
import { act, getView, type ActionInput } from "@/server/spaces-store";
import { resolveBearer } from "@/server/room-token";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { code } = await params;
  const url = new URL(req.url);
  const uid = url.searchParams.get("uid") ?? "";
  // Member views need the room token; without it the caller only ever sees
  // the public lobby summary.
  const view = getView(code, uid, url.searchParams.get("t") ?? undefined);
  if (!view) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ space: view });
}

export async function POST(req: Request, { params }: Ctx) {
  const { code } = await params;
  const body = (await req.json().catch(() => ({}))) as ActionInput & { uid?: unknown };
  // Signed-in identity is verified server-side and forced onto the action.
  const bearer = await resolveBearer(req);
  if (bearer.kind === "bad") {
    return NextResponse.json({ error: "bad_authorization" }, { status: 401 });
  }
  const result = act(code, body, bearer.kind === "ok" ? bearer.uid : null);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error === "not_found" ? 404 : 403 },
    );
  }
  return NextResponse.json({ space: result.view, token: result.token });
}
