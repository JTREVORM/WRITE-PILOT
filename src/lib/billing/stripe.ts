import "server-only";

import Stripe from "stripe";

import { serverEnv } from "@/lib/env/server";
import { AppError, ERROR_CODES } from "@/lib/utils/errors";

/**
 * The payment provider client.
 *
 * Constructed lazily and only when a key exists. Everything above this module
 * asks `isPaymentsConfigured` first and tells the user plainly when the answer
 * is no — an application that throws at the point of payment has already taken
 * the user's attention and given nothing back.
 *
 * The API version is pinned. A provider that silently changed the shape of a
 * subscription object underneath a running deployment would change what people
 * are entitled to, which is not something to discover from a support ticket.
 */
export const STRIPE_API_VERSION = "2026-08-26.dahlia";

export const BILLING_PROVIDER = "stripe";

let client: Stripe | null = null;
let verifier: Stripe | null = null;

export function getStripe(): Stripe {
  const key = serverEnv.STRIPE_SECRET_KEY;

  if (!key) {
    throw new AppError(
      ERROR_CODES.NOT_CONFIGURED,
      "Payments aren't configured on this deployment.",
    );
  }

  client ??= new Stripe(key, {
    apiVersion: STRIPE_API_VERSION,
    appInfo: { name: "WritePilot" },
    // Network blips should not become failed checkouts.
    maxNetworkRetries: 2,
    timeout: 20_000,
  });

  return client;
}

/**
 * Verifies a webhook delivery and returns the event it carries.
 *
 * The signature check is the whole of the trust here: without it the endpoint
 * is an unauthenticated instruction to grant credits to any account named in
 * the body. A missing secret therefore fails closed rather than skipping
 * verification.
 */
export function constructWebhookEvent(params: {
  payload: string;
  signature: string | null;
}): Stripe.Event {
  const secret = serverEnv.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    throw new AppError(
      ERROR_CODES.NOT_CONFIGURED,
      "No webhook signing secret is configured.",
    );
  }

  if (!params.signature) {
    throw new AppError(ERROR_CODES.NOT_AUTHORIZED, "Missing signature.");
  }

  try {
    return getWebhookVerifier().webhooks.constructEvent(
      params.payload,
      params.signature,
      secret,
    );
  } catch (error) {
    console.error(
      "[billing] webhook signature verification failed",
      error instanceof Error ? error.message : error,
    );
    throw new AppError(ERROR_CODES.NOT_AUTHORIZED, "Invalid signature.");
  }
}

/**
 * A client used only to verify signatures.
 *
 * Verification is an HMAC over the request body and touches no network, so it
 * needs the *webhook* secret and not the API key. Routing it through
 * `getStripe()` would make a deployment that has a signing secret but no API
 * key reject every genuine delivery as a forgery — which is precisely the
 * deployment where the operator is part-way through setting payments up.
 */
function getWebhookVerifier(): Stripe {
  if (serverEnv.STRIPE_SECRET_KEY) return getStripe();

  verifier ??= new Stripe("sk_signature_verification_only", {
    apiVersion: STRIPE_API_VERSION,
  });

  return verifier;
}
