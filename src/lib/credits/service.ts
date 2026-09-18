import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { AppError, ERROR_CODES, toAppError } from "@/lib/utils/errors";
import type { CreditTransactionType, Json } from "@/types/database";

/**
 * Credit movements.
 *
 * Every function here runs through the service role and calls a SECURITY
 * DEFINER database function, which is where the balance check, the row lock and
 * the ledger write happen together. Nothing in this file decides *whether* a
 * user may spend — that is the entitlement layer's job — it only performs the
 * movement once that decision has been made.
 */

export interface ConsumeResult {
  transactionId: string | null;
  charged: number;
  balance: number;
  replayed: boolean;
}

export interface GrantResult {
  transactionId: string | null;
  credited: number;
  balance: number;
  replayed: boolean;
}

const num = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const str = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

/**
 * Debits credits for a feature run.
 *
 * Pass an `idempotencyKey` whenever the caller might retry (a resubmitted form,
 * a queue redelivery): the database recognises the replay and returns the
 * original transaction instead of charging twice.
 *
 * Throws AppError(INSUFFICIENT_CREDITS) when the balance will not cover it.
 */
export async function consumeCredits(params: {
  userId: string;
  featureKey: string;
  credits: number;
  reason?: string;
  idempotencyKey?: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: Json;
}): Promise<ConsumeResult> {
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("consume_credits", {
    p_user_id: params.userId,
    p_feature_key: params.featureKey,
    p_credits: params.credits,
    p_reason: params.reason ?? null,
    p_idempotency_key: params.idempotencyKey ?? null,
    p_reference_type: params.referenceType ?? null,
    p_reference_id: params.referenceId ?? null,
    p_metadata: params.metadata ?? {},
  });

  if (error) {
    // The database raises this by name; surface it as the code the UI expects.
    if (error.message.includes("insufficient_credits")) {
      throw new AppError(ERROR_CODES.INSUFFICIENT_CREDITS);
    }
    throw toAppError(new Error(error.message));
  }

  const result = (data ?? {}) as Record<string, unknown>;
  return {
    transactionId: str(result.transaction_id),
    charged: num(result.charged),
    balance: num(result.balance),
    replayed: result.replayed === true,
  };
}

/** Adds credits: a plan allowance, a purchased pack or an admin correction. */
export async function grantCredits(params: {
  userId: string;
  credits: number;
  type: CreditTransactionType;
  reason?: string;
  idempotencyKey?: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: Json;
}): Promise<GrantResult> {
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("grant_credits", {
    p_user_id: params.userId,
    p_credits: params.credits,
    p_type: params.type,
    p_reason: params.reason ?? null,
    p_idempotency_key: params.idempotencyKey ?? null,
    p_reference_type: params.referenceType ?? null,
    p_reference_id: params.referenceId ?? null,
    p_metadata: params.metadata ?? {},
  });

  if (error) throw toAppError(new Error(error.message));

  const result = (data ?? {}) as Record<string, unknown>;
  return {
    transactionId: str(result.transaction_id),
    credited: num(result.credited),
    balance: num(result.balance),
    replayed: result.replayed === true,
  };
}

/**
 * Returns credits after an operation the user did not get the benefit of.
 *
 * Feature routes should call this in their failure path: charging for a
 * provider timeout is the fastest way to lose a paying user's trust. The
 * database enforces one refund per consumption.
 */
export async function refundCredits(params: {
  userId: string;
  transactionId: string;
  reason?: string;
}): Promise<{ refunded: number; balance: number; replayed: boolean }> {
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("refund_credits", {
    p_user_id: params.userId,
    p_transaction_id: params.transactionId,
    p_reason: params.reason ?? "Refund for failed operation",
  });

  if (error) throw toAppError(new Error(error.message));

  const result = (data ?? {}) as Record<string, unknown>;
  return {
    refunded: num(result.refunded),
    balance: num(result.balance),
    replayed: result.replayed === true,
  };
}

/** Recent ledger entries for the signed-in user's billing history. */
export async function getCreditHistory(userId: string, limit = 20) {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("credit_transactions")
    .select("id, type, amount, balance_after, feature_key, reason, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw toAppError(new Error(error.message));
  return data ?? [];
}
