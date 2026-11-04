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
export async function POST(req: Request) {
  const gate = await adminGate(req, "users.ban");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = (await req.json().catch(() => ({}))) as { userId?: string; banned?: boolean };
  const userId = String(body.userId ?? "");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

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
    ban_duration: body.banned ? "876000h" : "none", // ~100 years = permanent, 'none' = unban
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ blocked: body.banned === true });
}
