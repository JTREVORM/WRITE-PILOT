import "server-only";

import type Stripe from "stripe";

import { createAdminClient } from "@/lib/supabase/admin";
import { BILLING_PROVIDER, getStripe } from "./stripe";
import { resolveUserId } from "./service";
import {
  isHandledEvent,
  mapBillingInterval,
  mapSubscriptionStatus,
  toIsoTimestamp,
} from "./status";

/**
 * Applying what the provider says happened.
 *
 * Three rules run through all of it.
 *
 * **Exactly once.** A provider retries, and will happily deliver the same
 * event three times. The delivery is claimed in the database before anything
 * is applied, so the second arrival does no work at all.
 *
 * **The provider is the source of truth.** Every subscription event rewrites
 * our record from what the provider currently says, rather than applying a
 * delta. Events arrive out of order; a state that is reasserted is harmless,
 * a delta applied twice is not.
 *
 * **Nothing here trusts a browser.** These functions are reached only from the
 * webhook route, after a signature check, and they write through the service
 * role. A user cannot cause any of it by visiting a URL.
 */

export type WebhookOutcome = "processed" | "ignored" | "replayed";

export async function handleWebhookEvent(
  event: Stripe.Event,
): Promise<WebhookOutcome> {
  const admin = createAdminClient();

  // Claim the delivery. `false` means we have seen this event id before, which
  // is the ordinary case for a provider that retries on a slow response.
  const { data: isNew, error: claimError } = await admin.rpc(
    "record_payment_event",
    {
      p_provider: BILLING_PROVIDER,
      p_event_id: event.id,
      p_type: event.type,
      p_payload: JSON.parse(JSON.stringify(event.data.object ?? {})),
    },
  );

  if (claimError) {
    console.error("[billing] failed to record event", claimError.message);
    throw new Error(claimError.message);
  }

  if (!isNew) return "replayed";

  if (!isHandledEvent(event.type)) {
    await complete(event.id, "ignored");
    return "ignored";
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await onCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await onSubscriptionChanged(event.data.object as Stripe.Subscription);
        break;
      case "invoice.paid":
        await onInvoicePaid(event.data.object as Stripe.Invoice);
        break;
    }

    await complete(event.id, "processed");
    return "processed";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[billing] failed to handle ${event.type}`, message);
    await complete(event.id, "failed", message);
    throw error;
  }
}

async function complete(
  eventId: string,
  status: "processed" | "ignored" | "failed",
  error?: string,
): Promise<void> {
  const admin = createAdminClient();

  const { error: updateError } = await admin.rpc("complete_payment_event", {
    p_provider: BILLING_PROVIDER,
    p_event_id: eventId,
    p_status: status,
    p_error: error ?? null,
  });

  if (updateError) {
    console.error("[billing] failed to complete event", updateError.message);
  }
}

/**
 * A checkout finished.
 *
 * Only one-off purchases are applied here. A subscription checkout also
 * produces `customer.subscription.created`, which carries the authoritative
 * period and status — applying the plan twice from two events would be a
 * second month of credits.
 */
async function onCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  if (session.payment_status !== "paid") return;

  const userId = await resolveUserId({
    metadata: session.metadata,
    customerId: typeof session.customer === "string" ? session.customer : null,
    clientReferenceId: session.client_reference_id,
  });

  if (!userId) {
    throw new Error(`checkout session ${session.id} could not be attributed`);
  }

  const packKey = session.metadata?.pack_key;
  if (session.mode !== "payment" || !packKey) return;

  const admin = createAdminClient();

  // Keyed on the payment intent where there is one: it is the identifier that
  // survives a session being expired and recreated.
  const reference =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.id;

  const { error } = await admin.rpc("apply_credit_purchase", {
    p_user_id: userId,
    p_pack_key: packKey,
    p_provider: BILLING_PROVIDER,
    p_provider_reference: reference,
    p_amount_cents: session.amount_total ?? null,
  });

  if (error) throw new Error(error.message);
}

/**
 * A subscription was created, changed or ended.
 *
 * The plan is read from the price on the subscription rather than from the
 * metadata we set at checkout: a user who upgrades inside the provider's own
 * portal never passes through our checkout, and the price is what they are
 * actually being billed for.
 */
async function onSubscriptionChanged(
  subscription: Stripe.Subscription,
): Promise<void> {
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : null;

  const userId = await resolveUserId({
    metadata: subscription.metadata,
    customerId,
  });

  if (!userId) {
    throw new Error(`subscription ${subscription.id} could not be attributed`);
  }

  const item = subscription.items.data[0];
  const price = item?.price;
  const planKey = await planKeyForPrice(price?.id ?? null, subscription.metadata);

  if (!planKey) {
    throw new Error(
      `subscription ${subscription.id} carries price ${price?.id ?? "none"}, which matches no plan`,
    );
  }

  const status = mapSubscriptionStatus(subscription.status);
  const interval = mapBillingInterval(
    price?.recurring?.interval,
    price?.recurring?.interval_count,
  );

  // The period lives on the subscription item in current API versions.
  const periodStart = toIsoTimestamp(
    item?.current_period_start ?? subscription.start_date,
  );
  const periodEnd = toIsoTimestamp(item?.current_period_end);

  const admin = createAdminClient();
  const { error } = await admin.rpc("apply_subscription_state", {
    p_user_id: userId,
    p_plan_key: planKey,
    p_interval: interval,
    p_status: status,
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    p_provider: BILLING_PROVIDER,
    p_customer_id: customerId,
    p_subscription_id: subscription.id,
  });

  if (error) throw new Error(error.message);

  // A subscription that has ended returns the account to the free plan, so the
  // application keeps one rule for what a user may do rather than two.
  if (status === "canceled" || status === "expired") {
    const { error: freeError } = await admin.rpc("assign_plan", {
      p_user_id: userId,
      p_plan_key: "free",
    });

    if (freeError) {
      console.error("[billing] failed to return account to free", freeError.message);
    }
  }
}

/** A subscription invoice was paid. Recorded for the receipt history. */
async function onInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : null;

  const userId = await resolveUserId({
    metadata: invoice.metadata,
    customerId,
  });

  if (!userId) return;

  const admin = createAdminClient();
  const { error } = await admin.rpc("record_invoice_payment", {
    p_user_id: userId,
    p_provider: BILLING_PROVIDER,
    p_provider_reference: invoice.id ?? `invoice_${Date.now()}`,
    p_amount_cents: invoice.amount_paid ?? 0,
    p_currency: (invoice.currency ?? "usd").toUpperCase(),
    p_description: invoice.number ? `Invoice ${invoice.number}` : "Subscription",
  });

  if (error) throw new Error(error.message);
}

/**
 * Which plan a provider price belongs to.
 *
 * The catalogue is asked first, because that is where the mapping is
 * configured. Metadata is the fallback for a price that has not been recorded
 * yet — which is a misconfiguration, but one that should not lock a paying
 * customer out of the plan they bought.
 */
async function planKeyForPrice(
  priceId: string | null,
  metadata: Stripe.Metadata | null | undefined,
): Promise<string | null> {
  if (priceId) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("plans")
      .select("key")
      .or(
        `provider_price_id_monthly.eq.${priceId},provider_price_id_yearly.eq.${priceId}`,
      )
      .maybeSingle();

    if (data?.key) return data.key;
  }

  return metadata?.plan_key ?? null;
}

/** Fetches an event by id, for reconciling a delivery that was never handled. */
export async function fetchEvent(eventId: string): Promise<Stripe.Event> {
  return getStripe().events.retrieve(eventId);
}
