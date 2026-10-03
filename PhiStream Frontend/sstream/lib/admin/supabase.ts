import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Auth, used ONLY to sign staff in and hand the backend a token.
 * The browser never reads the database through Supabase: the publishable key
 * cannot reach the private tables (row-level security is on and has no public
 * policies), and all data comes from the backend's admin API.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let client: SupabaseClient | null = null;

/** null when the two public Supabase values are not configured. */
export function getSupabase(): SupabaseClient | null {
  if (!url || !publishableKey) return null;
  client ??= createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: "ostreams-control-room",
    },
  });
  return client;
}
