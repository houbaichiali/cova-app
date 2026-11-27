import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * Server-side URL guard for every /admin/** route: direct URL access with no
 * session goes to login, and a signed-in non-admin goes back to the student
 * space. The database stays the real authority (every admin RPC re-checks
 * permissions server-side); MFA enrollment keeps its dedicated client flow in
 * the AdminGate.
 */
export default async function AdminUrlGuard({ children }: { children: ReactNode }) {
  const supabase = await getSupabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const { data: access } = await supabase.rpc("admin_my_access");
  if (access?.is_admin !== true) redirect("/dashboard");
  return <>{children}</>;
}
