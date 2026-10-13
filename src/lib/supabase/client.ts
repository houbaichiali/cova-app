import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * The browser Supabase client (one per tab). Only call it from the browser: event handlers,
 * effects, or store subscriptions, never while rendering on the server.
 *
 * It uses the public anon key. Everything it can do is limited by Row Level Security, so this
 * key is safe to ship. Never put the service-role key in a NEXT_PUBLIC_ variable.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example).",
    );
  }
  client = createBrowserClient(url, key);
  return client;
}
