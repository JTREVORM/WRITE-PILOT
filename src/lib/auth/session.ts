import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { routes } from "@/lib/config/routes";
import type { ProfileRow } from "@/types/database";

/**
 * Server-side session access.
 *
 * Always via `supabase.auth.getUser()`, which revalidates the token with the
 * auth server. `getSession()` merely decodes a cookie the client controls and
 * must never be the basis of an authorisation decision.
 *
 * Each helper is wrapped in React's `cache` so a layout and the page it renders
 * share one lookup per request.
 */

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getCurrentProfile = cache(async (): Promise<ProfileRow | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[auth] failed to load profile", error.message);
    return null;
  }

  return data;
});

/** The signed-in user, or a redirect to sign-in preserving where they were. */
export async function requireUser(nextPath?: string): Promise<User> {
  const user = await getCurrentUser();

  if (!user) {
    const target = nextPath
      ? `${routes.login}?next=${encodeURIComponent(nextPath)}`
      : routes.login;
    redirect(target);
  }

  return user;
}

export async function requireProfile(): Promise<{
  user: User;
  profile: ProfileRow;
}> {
  const user = await requireUser();
  const profile = await getCurrentProfile();

  if (!profile) {
    // The signup trigger creates this row. Its absence means provisioning did
    // not complete, which the account page repairs rather than silently hiding.
    redirect(`${routes.dashboard}?error=profile_missing`);
  }

  return { user, profile };
}
