import type { AppRole, BillingInterval, SubscriptionStatus } from "@/types/database";

export interface FeatureEntitlement {
  key: string;
  name: string;
  category: string;
  /** Available on the current plan. */
  enabled: boolean;
  /** Effective cost, after any per-plan override. */
  creditCost: number;
  /** Longest input accepted, or null when only the credit balance applies. */
  maxWords: number | null;
  /** Uses allowed per billing period, or null for unmetered. */
  monthlyLimit: number | null;
  usedThisPeriod: number;
  remainingThisPeriod: number | null;
}

export interface PlanEntitlement {
  id: string;
  key: string;
  name: string;
  maxDocuments: number | null;
  maxFileSizeMb: number;
  maxWordsPerRequest: number | null;
  maxDocumentVersions: number | null;
  priorityProcessing: boolean;
  monthlyCredits: number;
}

export interface CreditEntitlement {
  /** Spendable total: plan allowance plus purchased credits. */
  balance: number;
  allowanceBalance: number;
  purchasedBalance: number;
  monthlyAllowance: number;
  periodStart: string | null;
  periodEnd: string | null;
  lifetimeConsumed: number;
}

export interface SubscriptionEntitlement {
  id: string;
  status: SubscriptionStatus;
  billingInterval: BillingInterval;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
}

export interface Entitlements {
  userId: string;
  plan: PlanEntitlement | null;
  subscription: SubscriptionEntitlement | null;
  credits: CreditEntitlement;
  features: Record<string, FeatureEntitlement>;
  roles: AppRole[];
  periodStart: string | null;
}

/** Why a feature was refused. Drives which CTA the UI shows. */
export type AccessDenialReason =
  | "not_in_plan"
  | "monthly_limit_reached"
  | "insufficient_credits"
  | "input_too_long"
  | "unknown_feature";

export type FeatureAccess =
  | { allowed: true; feature: FeatureEntitlement; creditCost: number }
  | {
      allowed: false;
      reason: AccessDenialReason;
      message: string;
      feature: FeatureEntitlement | null;
      creditCost: number;
      /** Shortfall in credits, when that is what blocked the request. */
      creditsShort?: number;
    };
