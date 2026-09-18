import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "./client";
import { welcomeEmail, lowCreditsEmail } from "./templates";

/**
 * User-facing notifications.
 *
 * Each notification is recorded in the `notifications` table (so it appears
 * in-app and survives an undelivered email) and then sent by email. The two are
 * deliberately independent: a mail provider outage should cost the user the
 * email, not the notification.
 */

async function record(params: {
  userId: string;
  type: string;
  title: string;
  body?: string;
  actionUrl?: string;
}) {
  try {
    const admin = createAdminClient();
    await admin.from("notifications").insert({
      user_id: params.userId,
      type: params.type,
      title: params.title,
      body: params.body ?? null,
      action_url: params.actionUrl ?? null,
    });
  } catch (error) {
    console.error("[notifications] failed to record", error);
  }
}

export async function notifyWelcome(params: {
  userId: string;
  email: string;
  name: string | null;
}) {
  await record({
    userId: params.userId,
    type: "welcome",
    title: "Welcome to WritePilot",
    body: "Your monthly credits are ready — try a grammar check to get started.",
    actionUrl: "/dashboard",
  });

  const template = welcomeEmail({ name: params.name });
  return sendEmail({
    to: params.email,
    ...template,
    // One welcome per account, however many times this is called.
    idempotencyKey: `welcome:${params.userId}`,
  });
}

export async function notifyLowCredits(params: {
  userId: string;
  email: string;
  name: string | null;
  balance: number;
  planName: string;
  /** Billing period, so the warning can be sent again next period. */
  periodKey: string;
}) {
  await record({
    userId: params.userId,
    type: "low_credits",
    title: `${params.balance} credits remaining`,
    body: "Top up or upgrade to keep using the tools this period.",
    actionUrl: "/usage",
  });

  const template = lowCreditsEmail({
    name: params.name,
    balance: params.balance,
    planName: params.planName,
  });

  return sendEmail({
    to: params.email,
    ...template,
    idempotencyKey: `low_credits:${params.userId}:${params.periodKey}`,
  });
}
