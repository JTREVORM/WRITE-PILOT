import type { AppRole } from "@/types/database";
import type { Entitlements, FeatureAccess } from "./types";

/**
 * Feature access policy.
 *
 * Pure functions over an already-loaded Entitlements object: no database, no
 * request context, no side effects. Keeping the policy separate from the IO in
 * ./service.ts means the rules that decide what a user may do can be unit
 * tested directly, and reused from a route handler, a background job or a UI
 * component without dragging a Supabase client along.
 */

/**
 * The gate every AI feature calls before doing any work.
 *
 * Checks, in the order a user would care about: does the plan include this at
 * all, is there a monthly cap in the way, is the input within limits, and only
 * then whether the balance covers it. Returning a reason rather than a boolean
 * is what lets the UI show the right next step — upgrade, top up, or shorten.
 */
export function checkFeatureAccess(
  entitlements: Entitlements,
  featureKey: string,
  options: { words?: number } = {},
): FeatureAccess {
  const feature = entitlements.features[featureKey];

  if (!feature) {
    return {
      allowed: false,
      reason: "unknown_feature",
      message: "This tool isn't available right now.",
      feature: null,
      creditCost: 0,
    };
  }

  if (!feature.enabled) {
    return {
      allowed: false,
      reason: "not_in_plan",
      message: `${feature.name} isn't included in your current plan. Upgrade to unlock it.`,
      feature,
      creditCost: feature.creditCost,
    };
  }

  if (feature.remainingThisPeriod !== null && feature.remainingThisPeriod <= 0) {
    return {
      allowed: false,
      reason: "monthly_limit_reached",
      message: `You've used all ${feature.monthlyLimit} ${feature.name} runs included this month. Your allowance resets next period.`,
      feature,
      creditCost: feature.creditCost,
    };
  }

  const limit = feature.maxWords ?? entitlements.plan?.maxWordsPerRequest ?? null;
  if (options.words !== undefined && limit !== null && options.words > limit) {
    return {
      allowed: false,
      reason: "input_too_long",
      message: `This text is ${options.words.toLocaleString()} words. Your plan allows up to ${limit.toLocaleString()} words per run — try a shorter section or upgrade.`,
      feature,
      creditCost: feature.creditCost,
    };
  }

  if (entitlements.credits.balance < feature.creditCost) {
    return {
      allowed: false,
      reason: "insufficient_credits",
      message: `This costs ${feature.creditCost} credits and you have ${entitlements.credits.balance}. Top up or upgrade to continue.`,
      feature,
      creditCost: feature.creditCost,
      creditsShort: feature.creditCost - entitlements.credits.balance,
    };
  }

  return { allowed: true, feature, creditCost: feature.creditCost };
}

export function hasRole(entitlements: Entitlements, role: AppRole) {
  return entitlements.roles.includes(role);
}

export function isAdmin(entitlements: Entitlements) {
  return hasRole(entitlements, "admin");
}
