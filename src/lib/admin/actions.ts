"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { ok, fail, type ActionResult } from "@/lib/utils/result";
import { routes } from "@/lib/config/routes";
import type { AppRole } from "@/types/database";

/**
 * Administrative actions.
 *
 * Each runs as the signed-in administrator rather than through the service
 * role, so the database checks the role a second time — `requireAdmin()` here
 * decides what is rendered, and the function decides what is permitted. A bug
 * in the first is then a wrong-looking page rather than a privilege escalation.
 *
 * Every one of them writes an audit row in the same transaction as the change.
 */

const ROLES: AppRole[] = ["user", "educator", "admin"];

export async function adjustCreditsAction(params: {
  userId: string;
  credits: number;
  reason: string;
}): Promise<ActionResult<null>> {
  await requireAdmin();

  const reason = params.reason.trim();
  if (!reason) {
    return fail("Say why. An unexplained adjustment is not auditable.");
  }

  if (!Number.isFinite(params.credits) || params.credits === 0) {
    return fail("Enter a non-zero number of credits.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_adjust_credits", {
    p_user_id: params.userId,
    p_credits: Math.trunc(params.credits),
    p_reason: reason,
  });

  if (error) {
    console.error("[admin] credit adjustment failed", error.message);
    return fail("That adjustment didn't go through.");
  }

  revalidatePath(`${routes.admin}/users/${params.userId}`);
  return ok(null);
}

export async function setPlanAction(params: {
  userId: string;
  planKey: string;
  reason: string;
}): Promise<ActionResult<null>> {
  await requireAdmin();

  if (!params.planKey.trim()) return fail("Choose a plan.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_plan", {
    p_user_id: params.userId,
    p_plan_key: params.planKey,
    p_reason: params.reason.trim() || null,
  });

  if (error) {
    console.error("[admin] plan change failed", error.message);
    return fail("That plan change didn't go through.");
  }

  revalidatePath(`${routes.admin}/users/${params.userId}`);
  return ok(null);
}

export async function setRoleAction(params: {
  userId: string;
  role: AppRole;
  grant: boolean;
  reason: string;
}): Promise<ActionResult<null>> {
  await requireAdmin();

  if (!ROLES.includes(params.role)) return fail("That is not a role.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_role", {
    p_user_id: params.userId,
    p_role: params.role,
    p_grant: params.grant,
    p_reason: params.reason.trim() || null,
  });

  if (error) {
    // The database refuses an administrator removing their own admin role, and
    // says so; passing that through is more useful than a generic failure.
    const message = error.message.includes("own admin role")
      ? "You can't remove your own admin role."
      : "That role change didn't go through.";

    console.error("[admin] role change failed", error.message);
    return fail(message);
  }

  revalidatePath(`${routes.admin}/users/${params.userId}`);
  return ok(null);
}
