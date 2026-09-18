"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { ok, fail, type ActionResult } from "@/lib/utils/result";

/**
 * Notification mutations.
 *
 * These run as the signed-in user, not the service role: marking your own
 * notification read is exactly the kind of thing RLS should be allowed to
 * authorise. The database also guards every column except `read_at`, so a
 * crafted request cannot rewrite the message itself.
 */

export async function markNotificationReadAction(
  id: string,
): Promise<ActionResult<null>> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);

  if (error) {
    console.error("[notifications] failed to mark read", error.message);
    return fail("We couldn't update that notification.");
  }

  // The unread badge lives in the shell, so the layout has to re-render.
  revalidatePath("/", "layout");
  return ok(null);
}

export async function markAllNotificationsReadAction(): Promise<
  ActionResult<null>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return fail("Please sign in to continue.", { code: "not_authenticated" });
  }

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) {
    console.error("[notifications] failed to mark all read", error.message);
    return fail("We couldn't update your notifications.");
  }

  revalidatePath("/", "layout");
  return ok(null);
}
