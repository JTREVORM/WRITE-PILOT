import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env/public";
import { serverEnv } from "@/lib/env/server";
import type { Database } from "@/types/database";

/**
 * Privileged Supabase client. **Bypasses Row Level Security entirely.**
 *
 * Reserved for operations a user must never be able to perform themselves:
 * moving credits, changing plans, writing usage records, administering roles.
 * Every call site must establish *which* user it is acting for and authorise
 * that decision itself, because the database will not do it here.
 *
 * The `server-only` import above makes importing this module from a Client
 * Component a build-time error.
 */
let cached: ReturnType<typeof createSupabaseClient<Database>> | null = null;

export function createAdminClient() {
  const serviceRoleKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured. Privileged operations " +
        "(credits, plan changes, usage logging) cannot run without it.",
    );
  }

  cached ??= createSupabaseClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey,
    {
      auth: {
        // A service-role client has no user session and must never try to
        // read, refresh or persist one.
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );

  return cached;
}
