import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppRole, Json } from "@/types/database";
import type {
  Entitlements,
  FeatureEntitlement,
  SubscriptionEntitlement,
} from "./types";

/**
 * The entitlement layer.
 *
 * Every feature route asks this module "may this user do this, and what does it
 * cost" instead of re-deriving plan rules locally. The rules themselves live in
 * the database (`get_entitlements`), so a plan change takes effect immediately
 * and identically everywhere.
 */

const EMPTY_CREDITS = {
  balance: 0,
  allowanceBalance: 0,
  purchasedBalance: 0,
  monthlyAllowance: 0,
  periodStart: null,
  periodEnd: null,
  lifetimeConsumed: 0,
};

type Rec = Record<string, unknown>;

const asRecord = (value: unknown): Rec =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : {};

const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const asNullableNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asString = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const asNullableString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const asBoolean = (value: unknown): boolean => value === true;

/**
 * Maps the `get_entitlements` JSON payload onto typed objects.
 *
 * Written defensively: the function is a database contract that may run ahead
 * of a deploy, so a missing key degrades to a safe default (feature disabled,
 * zero credits) rather than throwing in a page render.
 */
function parseEntitlements(payload: Json | null, userId: string): Entitlements {
  const root = asRecord(payload);
  const plan = asRecord(root.plan);
  const subscription = asRecord(root.subscription);
  const credits = asRecord(root.credits);
  const rawFeatures = asRecord(root.features);

  const features: Record<string, FeatureEntitlement> = {};
  for (const [key, value] of Object.entries(rawFeatures)) {
    const f = asRecord(value);
    features[key] = {
      key,
      name: asString(f.name, key),
      category: asString(f.category, "general"),
      enabled: asBoolean(f.enabled),
      creditCost: asNumber(f.credit_cost),
      maxWords: asNullableNumber(f.max_words),
      monthlyLimit: asNullableNumber(f.monthly_limit),
      usedThisPeriod: asNumber(f.used_this_period),
      remainingThisPeriod: asNullableNumber(f.remaining_this_period),
    };
  }

  return {
    userId,
    plan: plan.key
      ? {
          id: asString(plan.id),
          key: asString(plan.key),
          name: asString(plan.name),
          maxDocuments: asNullableNumber(plan.max_documents),
          maxFileSizeMb: asNumber(plan.max_file_size_mb, 5),
          maxWordsPerRequest: asNullableNumber(plan.max_words_per_request),
          maxDocumentVersions: asNullableNumber(plan.max_document_versions),
          priorityProcessing: asBoolean(plan.priority_processing),
          monthlyCredits: asNumber(plan.monthly_credits),
        }
      : null,
    subscription: subscription.id
      ? {
          id: asString(subscription.id),
          status: asString(
            subscription.status,
            "active",
          ) as SubscriptionEntitlement["status"],
          billingInterval: asString(
            subscription.billing_interval,
            "month",
          ) as SubscriptionEntitlement["billingInterval"],
          currentPeriodEnd: asNullableString(subscription.current_period_end),
          cancelAtPeriodEnd: asBoolean(subscription.cancel_at_period_end),
          trialEndsAt: asNullableString(subscription.trial_ends_at),
        }
      : null,
    credits: {
      ...EMPTY_CREDITS,
      balance: asNumber(credits.balance),
      allowanceBalance: asNumber(credits.allowance_balance),
      purchasedBalance: asNumber(credits.purchased_balance),
      monthlyAllowance: asNumber(credits.monthly_allowance),
      periodStart: asNullableString(credits.period_start),
      periodEnd: asNullableString(credits.period_end),
      lifetimeConsumed: asNumber(credits.lifetime_consumed),
    },
    features,
    roles: Array.isArray(root.roles) ? (root.roles as AppRole[]) : [],
    periodStart: asNullableString(root.period_start),
  };
}

/**
 * Entitlements for the signed-in user.
 *
 * Wrapped in React's `cache`, so a dashboard that shows the plan, the credit
 * balance and a feature grid makes one database round trip per request rather
 * than three.
 */
export const getEntitlements = cache(
  async (userId: string): Promise<Entitlements> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_entitlements", {
      p_user_id: userId,
    });

    if (error) {
      throw new Error(`Failed to load entitlements: ${error.message}`);
    }

    return parseEntitlements(data as Json, userId);
  },
);

/** What an account looks like when its entitlements cannot be read. */
export const EMPTY_ENTITLEMENTS = (userId: string): Entitlements => ({
  userId,
  plan: null,
  subscription: null,
  credits: { ...EMPTY_CREDITS },
  features: {},
  roles: [],
  periodStart: null,
});

/**
 * Entitlements that degrade instead of throwing.
 *
 * Used by anything rendered as part of the application shell, where a failed
 * read should cost the user a credit meter -- not the entire page. Every
 * feature gate already treats "no plan, no credits" as a refusal, so the
 * fallback is safe rather than permissive.
 */
export async function getEntitlementsSafe(
  userId: string,
): Promise<Entitlements> {
  try {
    return await getEntitlements(userId);
  } catch (error) {
    console.error("[entitlements] falling back to empty entitlements", error);
    return EMPTY_ENTITLEMENTS(userId);
  }
}

/**
 * Entitlements read with the service role, for background jobs and admin views
 * where there is no user session to authorise against.
 */
export async function getEntitlementsAsAdmin(
  userId: string,
): Promise<Entitlements> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_entitlements", {
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`Failed to load entitlements: ${error.message}`);
  }

  return parseEntitlements(data as Json, userId);
}

// The access policy itself lives in ./access.ts, which is free of server-only
// imports so it can be unit tested and reused anywhere.
export {
  checkFeatureAccess,
  hasRole,
  isAdmin,
} from "./access";
