// COVA — permanent account deletion (called by the Settings page).
//
// Deploy once, then set the service secret (never shipped to the browser):
//   supabase secrets set SERVICE_ROLE_KEY=<your service_role key>
//   supabase functions deploy delete-account
//
// The client calls POST /functions/v1/delete-account with the signed-in user's
// Authorization header. The function verifies that identity, then deletes the
// auth user with the admin API; every profile row, setting, notification,
// submission and storage object cascades through the foreign keys.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SERVICE_ROLE_KEY =
  Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  if (!SERVICE_ROLE_KEY) {
    return json(
      { error: "Deletion service is not configured (missing service key secret)." },
      500,
    );
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return json({ error: "Missing access token." }, 401);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );

  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser(token);
  if (userError || !user) {
    return json({ error: "Invalid or expired session." }, 401);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return json({ error: deleteError.message }, 500);
  }

  return json({ ok: true });
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
