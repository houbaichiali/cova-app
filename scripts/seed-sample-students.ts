/**
 * Seeds the built-in sample students as profiles (is_sample = true, no auth user) so the
 * "Sample" people, their profile pages and chats keep working.
 *
 *   npx tsx --env-file=.env.local scripts/seed-sample-students.ts
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY (bypasses RLS). Run it from your machine only.
 * NOTE: written against the Student shape used in the old store (id, name, headline, tone);
 * it was not run, because src/data/students was not part of the files I received.
 */
import { createClient } from "@supabase/supabase-js";
import { students } from "../src/data/students";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { error } = await supabase.from("profiles").upsert(
  students.map((s) => ({
    public_id: s.id,
    display_name: s.name,
    headline: s.headline,
    tone: s.tone,
    is_sample: true,
  })),
  { onConflict: "public_id" },
);
if (error) throw error;
console.log(`Seeded ${students.length} sample students.`);
