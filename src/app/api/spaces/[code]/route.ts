import { NextResponse } from "next/server";
import { act, getView, type ActionInput } from "@/server/spaces-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { code } = await params;
  const uid = new URL(req.url).searchParams.get("uid") ?? "";
  const view = getView(code, uid);
  if (!view) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ space: view });
}

export async function POST(req: Request, { params }: Ctx) {
  const { code } = await params;
  const body = (await req.json().catch(() => ({}))) as ActionInput;
  const result = act(code, body);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error === "not_found" ? 404 : 403 },
    );
  }
  return NextResponse.json({ space: result.view });
}
