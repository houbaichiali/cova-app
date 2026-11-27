import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client (read-only cookie access) for guards and server
 * components. Uses the same cookie session as the browser client, so the
 * middleware-free app still gets server-side route protection.
 *
 * Only the public anon key is used: everything remains limited by RLS.
 */
export async function getSupabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example).",
    );
  }
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      // Server components cannot write cookies; refreshes are handled by the
      // middleware-free browser client on its own next request.
      setAll() {
        // Intentionally left blank on the server-render path.
      },
    },
  });
}
