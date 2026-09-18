import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "./session";
import type { AppRole } from "@/types/database";

/**
 * Role guards for server-rendered pages and actions.
 *
 * Roles are read from the database on every request rather than from a token
 * claim, so revoking an admin takes effect immediately instead of at the next
 * token refresh. The query itself is protected by RLS: a user can only ever see
 * their own rows, so this cannot be used to probe anyone else's roles.
 */

export const getCurrentRoles = cache(async (): Promise<AppRole[]> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (error) {
    console.error("[auth] failed to load roles", error.message);
    return [];
  }

  return (data ?? []).map((row) => row.role);
});

export async function hasRole(role: AppRole) {
  return (await getCurrentRoles()).includes(role);
}

export async function isAdmin() {
  return hasRole("admin");
}

export async function isEducator() {
  const roles = await getCurrentRoles();
  return roles.includes("educator") || roles.includes("admin");
}

/**
 * Requires the admin role.
 *
 * Responds with a 404 rather than a 403: an unauthorised visitor learns nothing
 * about which admin routes exist. This is a defence in depth measure — the
 * admin data is protected by RLS regardless of what this returns.
 */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();

  if (!(await isAdmin())) {
    notFound();
  }

  return user;
}

export async function requireRole(role: AppRole): Promise<User> {
  const user = await requireUser();
  const roles = await getCurrentRoles();

  if (!roles.includes(role) && !roles.includes("admin")) {
    notFound();
  }

  return user;
}
