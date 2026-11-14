import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { adminGate } from "@/server/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Real account blocking for approved bans (auth.admin requires the
 * service-role key, which lives in server environment variables only and is
 * never shipped to the browser). Best-effort: when the key is not configured
 * the sanction is still recorded in the database, but the login is not
 * blocked — the response says so honestly.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const gate = await adminGate(req, "users.ban");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  // Strict input shape: a Supabase user id and a real boolean. Anything else
  // is rejected before it can reach the admin client.
  const body = (await req.json().catch(() => ({}))) as { userId?: unknown; banned?: unknown };
  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: "userId must be a valid id" }, { status: 400 });
  }
  if (typeof body.banned !== "boolean") {
    return NextResponse.json({ error: "banned must be true or false" }, { status: 400 });
  }
  const banned = body.banned;

  if (!url || !serviceKey) {
    return NextResponse.json(
      {
        blocked: false,
        note: "SUPABASE_SERVICE_ROLE_KEY is not configured: the sanction is recorded but the login is not blocked.",
      },
      { status: 200 },
    );
  }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: banned ? "876000h" : "none", // ~100 years = permanent, 'none' = unban
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ blocked: banned });
}
