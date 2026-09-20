import { after } from "next/server";

import { constructWebhookEvent } from "@/lib/billing/stripe";
import { handleWebhookEvent } from "@/lib/billing/webhook";
import { isWebhookConfigured } from "@/lib/env/server";

/**
 * The payment provider's webhook endpoint.
 *
 * This is the only path in the application that may change what a user is
 * entitled to without a session behind it, so the shape of it matters.
 *
 * The raw body is read as text and verified against the signature header
 * before anything is parsed — a parsed body cannot be verified, because the
 * signature covers the exact bytes that were sent. Without a configured
 * signing secret the endpoint refuses everything rather than trusting an
 * unverified body, which would be an open instruction to grant credits.
 *
 * Handling happens after the response is sent. A provider treats a slow reply
 * as a failure and retries, and the delivery is already claimed in the
 * database by then, so a retry is a no-op rather than a second month of
 * credits.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!isWebhookConfigured) {
    console.error("[billing] webhook received but no signing secret is set");
    return Response.json({ error: "not_configured" }, { status: 503 });
  }

  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  let event;
  try {
    event = constructWebhookEvent({ payload, signature });
  } catch {
    // Deliberately terse: an attacker probing this endpoint learns nothing
    // about why their signature was rejected.
    return Response.json({ error: "invalid_signature" }, { status: 400 });
  }

  after(async () => {
    try {
      const outcome = await handleWebhookEvent(event);
      if (outcome !== "replayed") {
        console.info(`[billing] ${event.type} ${outcome} (${event.id})`);
      }
    } catch (error) {
      // Already recorded as failed against the event id, which is what makes
      // it findable later. Nothing is retried here: the provider will.
      console.error(
        `[billing] unhandled failure for ${event.id}`,
        error instanceof Error ? error.message : error,
      );
    }
  });

  return Response.json({ received: true });
}

/** A GET is almost always someone checking the endpoint exists. */
export async function GET(): Promise<Response> {
  return Response.json(
    { ok: true, endpoint: "stripe-webhook", configured: isWebhookConfigured },
    { status: 200 },
  );
}
