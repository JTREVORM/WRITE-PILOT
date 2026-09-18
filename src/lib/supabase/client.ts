"use client";

import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env/public";
import type { Database } from "@/types/database";

/**
 * Supabase client for Client Components.
 *
 * Uses the anon key, so every query it makes is subject to Row Level Security.
 * `createBrowserClient` memoises internally, so calling this per component is
 * cheap and avoids sharing a client across React trees.
 */
export function createClient() {
  return createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
