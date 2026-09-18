import "server-only";

import { Resend } from "resend";

import { isEmailConfigured, serverEnv } from "@/lib/env/server";

/**
 * Transactional email via Resend.
 *
 * Account lifecycle mail — verification, password recovery, email change — is
 * sent by Supabase Auth itself, because those messages must carry tokens that
 * only the auth server can mint. This module covers everything else: welcome
 * mail, usage and credit warnings, subscription notices.
 *
 * When Resend is not configured the send is skipped and reported, rather than
 * throwing. A missing integration should never fail the user action that
 * happened to trigger a notification.
 */

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** Collapses duplicate sends caused by a retry. */
  idempotencyKey?: string;
}

export type SendEmailResult =
  | { sent: true; id: string | null }
  | { sent: false; reason: "not_configured" | "failed"; message?: string };

let client: Resend | null = null;

function getClient(): Resend | null {
  if (!isEmailConfigured || !serverEnv.RESEND_API_KEY) return null;
  client ??= new Resend(serverEnv.RESEND_API_KEY);
  return client;
}

export async function sendEmail(
  params: SendEmailParams,
): Promise<SendEmailResult> {
  const resend = getClient();

  if (!resend || !serverEnv.RESEND_FROM_EMAIL) {
    console.warn(
      `[email] skipped "${params.subject}" — RESEND_API_KEY and ` +
        "RESEND_FROM_EMAIL are not configured.",
    );
    return { sent: false, reason: "not_configured" };
  }

  try {
    const { data, error } = await resend.emails.send(
      {
        from: serverEnv.RESEND_FROM_EMAIL,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
        replyTo: params.replyTo ?? serverEnv.RESEND_REPLY_TO_EMAIL,
      },
      params.idempotencyKey
        ? { idempotencyKey: params.idempotencyKey }
        : undefined,
    );

    if (error) {
      console.error("[email] send failed", error.message);
      return { sent: false, reason: "failed", message: error.message };
    }

    return { sent: true, id: data?.id ?? null };
  } catch (error) {
    // Never let a mail provider outage surface as a failed user action.
    console.error("[email] send threw", error);
    return {
      sent: false,
      reason: "failed",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
