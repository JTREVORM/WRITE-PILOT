import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Json, UsageStatus } from "@/types/database";

/**
 * Usage tracking.
 *
 * Every AI operation is recorded — successes, failures and attempts rejected by
 * the entitlement layer alike. Recording the rejections is what makes the data
 * useful later for pricing (what do people actually try to do?) and for abuse
 * detection, rather than only measuring what already worked.
 */

export interface RecordUsageParams {
  userId: string;
  featureKey: string;
  status?: UsageStatus;
  credits?: number;
  words?: number;
  characters?: number;
  durationMs?: number;
  provider?: string;
  model?: string;
  errorCode?: string;
  errorMessage?: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: Json;
}

/**
 * Writes a usage record and rolls the monthly counter forward.
 *
 * Never throws: telemetry must not be able to fail a request the user already
 * paid for. A failure here is logged and swallowed.
 */
export async function recordUsage(
  params: RecordUsageParams,
): Promise<string | null> {
  try {
    const admin = createAdminClient();

    const { data, error } = await admin.rpc("log_feature_usage", {
      p_user_id: params.userId,
      p_feature_key: params.featureKey,
      p_status: params.status ?? "success",
      p_credits: params.credits ?? 0,
      p_words: params.words ?? 0,
      p_characters: params.characters ?? 0,
      p_duration_ms: params.durationMs ?? null,
      p_provider: params.provider ?? null,
      p_model: params.model ?? null,
      p_error_code: params.errorCode ?? null,
      p_error_message: params.errorMessage ?? null,
      p_reference_type: params.referenceType ?? null,
      p_reference_id: params.referenceId ?? null,
      p_metadata: params.metadata ?? {},
    });

    if (error) {
      console.error("[usage] failed to record usage", {
        featureKey: params.featureKey,
        message: error.message,
      });
      return null;
    }

    return typeof data === "string" ? data : null;
  } catch (error) {
    console.error("[usage] failed to record usage", error);
    return null;
  }
}

/**
 * Per-feature usage for the signed-in user's current period.
 * Read through the user's own client, so RLS confirms the scoping.
 */
export async function getUsageThisPeriod(userId: string) {
  const supabase = await createClient();
  const periodStart = new Date();
  periodStart.setUTCDate(1);
  periodStart.setUTCHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("usage_counters")
    .select("feature_key, used_count, credits_used, words_used")
    .eq("user_id", userId)
    .eq("period_start", periodStart.toISOString());

  if (error) {
    console.error("[usage] failed to read counters", error.message);
    return [];
  }

  return data ?? [];
}

/** Most recent operations, for the dashboard's activity list. */
export async function getRecentActivity(userId: string, limit = 5) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("usage_logs")
    .select("id, feature_key, status, credits_charged, words_processed, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[usage] failed to read activity", error.message);
    return [];
  }

  return data ?? [];
}
