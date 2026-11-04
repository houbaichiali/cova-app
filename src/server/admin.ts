import { createClient } from "@supabase/supabase-js";

/**
 * Server-side admin gate. The browser never decides: every admin route and
 * server action resolves the caller from their Supabase access token and
 * asks the database (security-definer RPC) whether the required permission
 * is held. A direct URL or a forged client state cannot bypass this.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export interface AdminAccess {
  is_admin: boolean;
  role: string | null;
  permissions: string[];
  mfa_ok: boolean;
}

export type AdminGateResult =
  | { ok: true; userId: string; access: AdminAccess }
  | { ok: false; status: number; error: string };

export async function adminGate(req: Request, permission?: string): Promise<AdminGateResult> {
  if (!url || !key) return { ok: false, status: 500, error: "Supabase not configured" };
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, status: 401, error: "Sign in first" };

  const client = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) return { ok: false, status: 401, error: "Sign in first" };

  const { data, error } = await client.rpc("admin_my_access");
  if (error) return { ok: false, status: 500, error: "Admin check failed" };
  const access = data as AdminAccess;
  if (!access?.is_admin) return { ok: false, status: 403, error: "Admin access required" };
  // MFA is mandatory for the Admin Center: a verified second factor must be
  // present before any administrative call goes through.
  if (!access.mfa_ok) return { ok: false, status: 403, error: "MFA enrollment required" };
  if (permission && !access.permissions.includes(permission)) {
    return { ok: false, status: 403, error: `Missing permission: ${permission}` };
  }
  return { ok: true, userId: userData.user.id, access };
}
