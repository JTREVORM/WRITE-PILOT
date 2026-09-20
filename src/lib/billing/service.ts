import "server-only";

import type Stripe from "stripe";

import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env/public";
import { isPaymentsConfigured } from "@/lib/env/server";
import { AppError, ERROR_CODES } from "@/lib/utils/errors";
import { routes } from "@/lib/config/routes";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { BILLING_PROVIDER, getStripe } from "./stripe";
import type { BillingIntervalValue } from "./status";

/**
 * Starting a purchase.
 *
 * Nothing here changes what a user is entitled to. A checkout session is an
 * intention: the browser is sent to the provider, and the plan changes only
 * when the provider tells us over a signed webhook that money moved. The
 * success URL is a page a user can type into the address bar, so it is treated
 * as one — it says "we're setting this up", never "you're on Pro now".
 */

/** Where the provider sends the browser back to. */
function returnUrls(kind: "plan" | "credits") {
  const base = publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");

  return {
    success: `${base}${routes.billing}?checkout=complete&kind=${kind}`,
    cancel: `${base}${routes.pricing}?checkout=cancelled`,
  };
}

function assertConfigured(): void {
  if (!isPaymentsConfigured) {
    throw new AppError(
      ERROR_CODES.NOT_CONFIGURED,
      "Payments aren't configured on this deployment yet.",
    );
  }
}

/**
 * Finds or creates the provider's customer record for a user.
 *
 * Stored on our side so a returning user keeps one customer — and therefore one
 * billing history and one payment method — rather than accumulating a new one
 * per checkout.
 */
export async function ensureBillingCustomer(params: {
  userId: string;
  email: string;
  fullName?: string | null;
}): Promise<string> {
  assertConfigured();

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("billing_customers")
    .select("provider_customer_id")
    .eq("user_id", params.userId)
    .maybeSingle();

  if (existing?.provider_customer_id) return existing.provider_customer_id;

  const customer = await getStripe().customers.create({
    email: params.email,
    name: params.fullName ?? undefined,
    // The user id travels with the customer so a webhook that arrives with no
    // session context can still be attributed to an account.
    metadata: { user_id: params.userId },
  });

  const { error } = await admin.from("billing_customers").insert({
    user_id: params.userId,
    provider: BILLING_PROVIDER,
    provider_customer_id: customer.id,
  });

  if (error) {
    // A concurrent request won the race; theirs is as good as ours.
    console.error("[billing] failed to store customer", error.message);

    const { data: raced } = await admin
      .from("billing_customers")
      .select("provider_customer_id")
      .eq("user_id", params.userId)
      .maybeSingle();

    if (raced?.provider_customer_id) return raced.provider_customer_id;
    throw new AppError(ERROR_CODES.UNKNOWN);
  }

  return customer.id;
}

export async function createPlanCheckout(params: {
  userId: string;
  email: string;
  fullName?: string | null;
  planKey: string;
  interval: BillingIntervalValue;
}): Promise<{ url: string }> {
  assertConfigured();

  // A checkout session creates a record at the provider; a loop of them is a
  // mess in somebody else's system as well as ours.
  await enforceRateLimit("checkout", params.userId);

  const admin = createAdminClient();

  const { data: plan } = await admin
    .from("plans")
    .select(
      "id, key, name, price_monthly_cents, provider_price_id_monthly, provider_price_id_yearly, is_active",
    )
    .eq("key", params.planKey)
    .maybeSingle();

  if (!plan || !plan.is_active) {
    throw new AppError(ERROR_CODES.NOT_AUTHORIZED, "That plan isn't available.");
  }

  const priceId =
    params.interval === "year"
      ? plan.provider_price_id_yearly
      : plan.provider_price_id_monthly;

  if (!priceId) {
    // The catalogue exists but has not been connected to the provider. Saying
    // so is better than a checkout that fails on the provider's own page.
    throw new AppError(
      ERROR_CODES.NOT_CONFIGURED,
      `${plan.name} isn't available for purchase yet.`,
    );
  }

  const customerId = await ensureBillingCustomer({
    userId: params.userId,
    email: params.email,
    fullName: params.fullName,
  });

  const urls = returnUrls("plan");

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: urls.success,
    cancel_url: urls.cancel,
    allow_promotion_codes: true,
    // Carried into every event this checkout produces, so the webhook never
    // has to guess which account or plan it is about.
    client_reference_id: params.userId,
    metadata: {
      user_id: params.userId,
      plan_key: plan.key,
      interval: params.interval,
    },
    subscription_data: {
      metadata: {
        user_id: params.userId,
        plan_key: plan.key,
      },
    },
  });

  if (!session.url) {
    throw new AppError(ERROR_CODES.UNKNOWN, "Couldn't start checkout.");
  }

  return { url: session.url };
}

export async function createPackCheckout(params: {
  userId: string;
  email: string;
  fullName?: string | null;
  packKey: string;
}): Promise<{ url: string }> {
  assertConfigured();

  // A checkout session creates a record at the provider; a loop of them is a
  // mess in somebody else's system as well as ours.
  await enforceRateLimit("checkout", params.userId);

  const admin = createAdminClient();

  const { data: pack } = await admin
    .from("credit_packs")
    .select("id, key, name, credits, provider_price_id, is_active")
    .eq("key", params.packKey)
    .maybeSingle();

  if (!pack || !pack.is_active) {
    throw new AppError(ERROR_CODES.NOT_AUTHORIZED, "That credit pack isn't available.");
  }

  if (!pack.provider_price_id) {
    throw new AppError(
      ERROR_CODES.NOT_CONFIGURED,
      `${pack.name} isn't available for purchase yet.`,
    );
  }

  const customerId = await ensureBillingCustomer({
    userId: params.userId,
    email: params.email,
    fullName: params.fullName,
  });

  const urls = returnUrls("credits");

  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    line_items: [{ price: pack.provider_price_id, quantity: 1 }],
    success_url: urls.success,
    cancel_url: urls.cancel,
    client_reference_id: params.userId,
    metadata: {
      user_id: params.userId,
      pack_key: pack.key,
    },
    payment_intent_data: {
      metadata: { user_id: params.userId, pack_key: pack.key },
    },
  });

  if (!session.url) {
    throw new AppError(ERROR_CODES.UNKNOWN, "Couldn't start checkout.");
  }

  return { url: session.url };
}

/**
 * The provider's own billing portal.
 *
 * Cancelling, changing a card and downloading invoices all happen there rather
 * than being rebuilt here. Whatever the user does in it comes back as a webhook
 * and is applied exactly like any other change.
 */
export async function createBillingPortalSession(params: {
  userId: string;
}): Promise<{ url: string }> {
  assertConfigured();

  const admin = createAdminClient();

  const { data: customer } = await admin
    .from("billing_customers")
    .select("provider_customer_id")
    .eq("user_id", params.userId)
    .maybeSingle();

  if (!customer?.provider_customer_id) {
    throw new AppError(
      ERROR_CODES.NOT_AUTHORIZED,
      "There's nothing to manage yet — you're on the free plan.",
    );
  }

  const base = publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");

  const session = await getStripe().billingPortal.sessions.create({
    customer: customer.provider_customer_id,
    return_url: `${base}${routes.billing}`,
  });

  return { url: session.url };
}

/** Resolves the account a provider object belongs to. */
export async function resolveUserId(params: {
  metadata?: Stripe.Metadata | null;
  customerId?: string | null;
  clientReferenceId?: string | null;
}): Promise<string | null> {
  const fromMetadata = params.metadata?.user_id;
  if (fromMetadata) return fromMetadata;

  if (params.clientReferenceId) return params.clientReferenceId;

  if (!params.customerId) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("billing_customers")
    .select("user_id")
    .eq("provider", BILLING_PROVIDER)
    .eq("provider_customer_id", params.customerId)
    .maybeSingle();

  return data?.user_id ?? null;
}
