import "server-only";

import type { User } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/env/server";
import type { ProfileRow } from "@/types/database";

/**
 * Repairs an account whose provisioning did not complete.
 *
 * Normally the `handle_new_user` trigger creates the profile, role, wallet and
 * free subscription during signup. That trigger deliberately does not fail a
 * signup if the later steps error, so an account can exist with a partial
 * setup — and users created before this schema shipped have none of it at all.
 *
 * Rather than showing such a user a broken dashboard, the app layout calls this
 * once and continues. It is idempotent: `provision_user` will not re-grant
 * credits that were already granted.
 */
export async function ensureProvisioned(user: User): Promise<ProfileRow | null> {
  if (!isServiceRoleConfigured) {
    console.error(
      "[provisioning] SUPABASE_SERVICE_ROLE_KEY is not set — cannot repair " +
        `account ${user.id}. Set it in the server environment.`,
    );
    return null;
  }

  const admin = createAdminClient();
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;

  const asString = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : null;

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email ?? "",
        full_name: asString(metadata.full_name) ?? asString(metadata.name),
        avatar_url: asString(metadata.avatar_url) ?? asString(metadata.picture),
        country: asString(metadata.country)?.toUpperCase() ?? null,
        timezone: asString(metadata.timezone) ?? "UTC",
      },
      { onConflict: "id", ignoreDuplicates: false },
    )
    .select("*")
    .single();

  if (profileError) {
    console.error("[provisioning] failed to create profile", profileError.message);
    return null;
  }

  const { error: provisionError } = await admin.rpc("provision_user", {
    p_user_id: user.id,
  });

  if (provisionError) {
    // The profile exists, so the app is usable; entitlements will be empty
    // until this succeeds, which the dashboard surfaces to the user.
    console.error(
      "[provisioning] failed to provision entitlements",
      provisionError.message,
    );
  }

  return profile;
}
