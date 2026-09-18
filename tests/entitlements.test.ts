import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkFeatureAccess, isAdmin } from "../src/lib/entitlements/access.ts";
import type { Entitlements, FeatureEntitlement } from "../src/lib/entitlements/types.ts";

/**
 * Tests for the feature access policy.
 *
 * This is the gate in front of every paid operation, so the cases that matter
 * are the refusals: each one drives a different call to action in the UI, and
 * getting the order wrong would, for example, tell a user to buy credits when
 * the real problem is that their plan does not include the tool at all.
 */

function feature(overrides: Partial<FeatureEntitlement> = {}): FeatureEntitlement {
  return {
    key: "grammar_check",
    name: "Grammar Checker",
    category: "writing",
    enabled: true,
    creditCost: 1,
    maxWords: 20000,
    monthlyLimit: null,
    usedThisPeriod: 0,
    remainingThisPeriod: null,
    ...overrides,
  };
}

function entitlements(
  featureOverrides: Partial<FeatureEntitlement> = {},
  overrides: Partial<Entitlements> = {},
): Entitlements {
  return {
    userId: "00000000-0000-0000-0000-000000000001",
    plan: {
      id: "plan-1",
      key: "free",
      name: "Free",
      maxDocuments: 5,
      maxFileSizeMb: 5,
      maxWordsPerRequest: 1500,
      maxDocumentVersions: 3,
      priorityProcessing: false,
      monthlyCredits: 30,
    },
    subscription: null,
    credits: {
      balance: 30,
      allowanceBalance: 30,
      purchasedBalance: 0,
      monthlyAllowance: 30,
      periodStart: null,
      periodEnd: null,
      lifetimeConsumed: 0,
    },
    features: { grammar_check: feature(featureOverrides) },
    roles: ["user"],
    periodStart: null,
    ...overrides,
  };
}

describe("checkFeatureAccess", () => {
  it("allows a run that is within plan, limit and balance", () => {
    const result = checkFeatureAccess(entitlements(), "grammar_check", { words: 500 });
    assert.equal(result.allowed, true);
    assert.equal(result.allowed && result.creditCost, 1);
  });

  it("refuses an unknown feature key rather than assuming it is free", () => {
    const result = checkFeatureAccess(entitlements(), "not_a_real_feature");
    assert.equal(result.allowed, false);
    assert.equal(result.allowed === false && result.reason, "unknown_feature");
  });

  it("refuses a feature the plan does not include", () => {
    const result = checkFeatureAccess(
      entitlements({ enabled: false }),
      "grammar_check",
    );
    assert.equal(result.allowed, false);
    assert.equal(result.allowed === false && result.reason, "not_in_plan");
  });

  it("refuses once the monthly limit is exhausted", () => {
    const result = checkFeatureAccess(
      entitlements({ monthlyLimit: 20, usedThisPeriod: 20, remainingThisPeriod: 0 }),
      "grammar_check",
    );
    assert.equal(result.allowed, false);
    assert.equal(result.allowed === false && result.reason, "monthly_limit_reached");
  });

  it("allows the final run before the monthly limit is reached", () => {
    const result = checkFeatureAccess(
      entitlements({ monthlyLimit: 20, usedThisPeriod: 19, remainingThisPeriod: 1 }),
      "grammar_check",
    );
    assert.equal(result.allowed, true);
  });

  it("refuses input longer than the feature allows", () => {
    const result = checkFeatureAccess(
      entitlements({ maxWords: 1000 }),
      "grammar_check",
      { words: 1001 },
    );
    assert.equal(result.allowed, false);
    assert.equal(result.allowed === false && result.reason, "input_too_long");
  });

  it("falls back to the plan word limit when the feature sets none", () => {
    const result = checkFeatureAccess(
      entitlements({ maxWords: null }),
      "grammar_check",
      { words: 1501 }, // plan limit is 1500
    );
    assert.equal(result.allowed, false);
    assert.equal(result.allowed === false && result.reason, "input_too_long");
  });

  it("refuses when the balance will not cover the cost, and reports the shortfall", () => {
    const base = entitlements({ creditCost: 10 });
    const result = checkFeatureAccess(
      { ...base, credits: { ...base.credits, balance: 4 } },
      "grammar_check",
    );
    assert.equal(result.allowed, false);
    assert.equal(result.allowed === false && result.reason, "insufficient_credits");
    assert.equal(result.allowed === false && result.creditsShort, 6);
  });

  it("allows a run that spends the balance exactly", () => {
    const base = entitlements({ creditCost: 4 });
    const result = checkFeatureAccess(
      { ...base, credits: { ...base.credits, balance: 4 } },
      "grammar_check",
    );
    assert.equal(result.allowed, true);
  });

  it("reports the plan problem before the credit problem", () => {
    // A user on the wrong plan with no credits should be told to upgrade, not
    // to buy credits that still would not unlock the tool.
    const base = entitlements({ enabled: false, creditCost: 10 });
    const result = checkFeatureAccess(
      { ...base, credits: { ...base.credits, balance: 0 } },
      "grammar_check",
    );
    assert.equal(result.allowed === false && result.reason, "not_in_plan");
  });

  it("does not enforce a word limit when the caller supplies no word count", () => {
    const result = checkFeatureAccess(entitlements({ maxWords: 10 }), "grammar_check");
    assert.equal(result.allowed, true);
  });
});

describe("isAdmin", () => {
  it("is false for an ordinary user", () => {
    assert.equal(isAdmin(entitlements()), false);
  });

  it("is true when the admin role is present", () => {
    assert.equal(isAdmin(entitlements({}, { roles: ["user", "admin"] })), true);
  });
});
