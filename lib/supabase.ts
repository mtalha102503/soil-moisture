/**
 * Server-side Supabase client.
 *
 * This module must only ever be imported from server code (the API
 * route). It reads the project SECRET key from the environment so the
 * key is never shipped to the browser.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error(
      "Supabase is not configured: set SUPABASE_URL and SUPABASE_SECRET_KEY " +
        "in .env.local (local) or in the Vercel project environment variables."
    );
  }
  cached = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
