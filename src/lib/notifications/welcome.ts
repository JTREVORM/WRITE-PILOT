import "server-only";

import { createClient } from "@/lib/supabase/server";
import { hasNotificationOfType } from "./service";
import { notifyWelcome } from "@/lib/email/notifications";
import { isServiceRoleConfigured } from "@/lib/env/server";

/**
 * Sends the welcome notification, once per account.
 *
 * Called from the auth callback routes, which is the moment a signup actually
 * completes — the database trigger that provisions the account cannot send mail
 * from inside Postgres, and the app layout runs on every request, which is the
 * wrong place for a once-only side effect.
 *
 * Guarded three ways, because a confirmation link is often opened more than
 * once: the type check here, the notification insert, and an idempotency key on
 * the email itself.
 *
 * Never throws. A failed welcome must not break the redirect that signs the
 * user in.
 */
export async function sendWelcomeIfFirstTime(): Promise<void> {
  if (!isServiceRoleConfigured) return;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) return;

    if (await hasNotificationOfType(user.id, "welcome")) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    await notifyWelcome({
      userId: user.id,
      email: user.email,
      name: profile?.full_name ?? null,
    });
  } catch (error) {
    console.error("[notifications] welcome failed", error);
  }
}
