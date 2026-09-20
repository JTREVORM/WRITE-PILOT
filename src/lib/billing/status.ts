/**
 * Translating a payment provider's vocabulary into ours.
 *
 * Pure, and tested, because it is the join between two systems that will drift:
 * Stripe adds a subscription status, our enum does not have it, and the safe
 * answer has to be decided once rather than guessed at three call sites.
 *
 * The bias throughout is conservative. An unrecognised status becomes one that
 * does not grant anything, because the failure we can afford is a user who has
 * to contact support, not a user with credits they did not buy.
 */

export type SubscriptionStatusValue =
  | "trialing"
  | "active"
  | "past_due"
  | "paused"
  | "canceled"
  | "incomplete"
  | "expired";

export type BillingIntervalValue = "month" | "year";

const STATUS_MAP: Record<string, SubscriptionStatusValue> = {
  trialing: "trialing",
  active: "active",
  past_due: "past_due",
  paused: "paused",
  canceled: "canceled",
  unpaid: "past_due",
  incomplete: "incomplete",
  incomplete_expired: "expired",
};

export function mapSubscriptionStatus(value: string | null | undefined): SubscriptionStatusValue {
  if (!value) return "incomplete";
  return STATUS_MAP[value] ?? "incomplete";
}

/** Whether a status is one the user should be able to spend a plan on. */
export function isEntitledStatus(status: SubscriptionStatusValue): boolean {
  return status === "trialing" || status === "active";
}

/**
 * The billing interval, from the provider's recurring price.
 *
 * Anything that is not annual is treated as monthly: a weekly or daily price
 * would be a configuration mistake, and billing it as a year would be the
 * expensive way to find out.
 */
export function mapBillingInterval(
  interval: string | null | undefined,
  intervalCount: number | null | undefined = 1,
): BillingIntervalValue {
  if (interval === "year" && (intervalCount ?? 1) === 1) return "year";
  if (interval === "month" && (intervalCount ?? 1) === 12) return "year";
  return "month";
}

/** Seconds since the epoch, as the provider sends them, to an ISO instant. */
export function toIsoTimestamp(
  seconds: number | null | undefined,
): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  return new Date(seconds * 1000).toISOString();
}

/**
 * The webhook event types this application acts on.
 *
 * Everything else is recorded and ignored rather than rejected: a provider
 * sending an event we do not handle is normal, and a 400 would make it retry
 * forever.
 */
export const HANDLED_EVENT_TYPES = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
] as const;

export type HandledEventType = (typeof HANDLED_EVENT_TYPES)[number];

export function isHandledEvent(type: string): type is HandledEventType {
  return (HANDLED_EVENT_TYPES as readonly string[]).includes(type);
}
