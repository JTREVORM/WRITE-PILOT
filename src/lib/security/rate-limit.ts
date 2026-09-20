import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { AppError, ERROR_CODES } from "@/lib/utils/errors";

/**
 * Request rate limits.
 *
 * Separate from entitlements on purpose. Entitlements answer "may this account
 * afford this?"; this answers "is this account, or this address, going faster
 * than the service should serve?" A user with two thousand credits still should
 * not be able to open forty concurrent analyses, and a sign-in form should not
 * accept ten thousand passwords for one email.
 *
 * The counter lives in Postgres because the application runs as more than one
 * instance, and a limit each instance counts for itself is not a limit.
 *
 * **Failing open is deliberate.** If the counter itself is unavailable, the
 * request proceeds. A limiter that takes the product down when its own
 * bookkeeping breaks has caused a worse outage than the one it prevents — and
 * the authorisation checks underneath it are unaffected either way.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: string | null;
}

export const RATE_LIMITS = {
  /** One AI run at a time is generous; forty a minute is not a person. */
  aiRun: { limit: 20, windowSeconds: 60 },
  /** Password attempts against one email address. */
  signIn: { limit: 10, windowSeconds: 300 },
  /** Account creation from one address. */
  signUp: { limit: 5, windowSeconds: 3600 },
  /** Password reset emails for one address. */
  passwordReset: { limit: 5, windowSeconds: 3600 },
  /** Starting a checkout, which creates a record at the payment provider. */
  checkout: { limit: 10, windowSeconds: 300 },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

/**
 * Counts one request against a key.
 *
 * The key is built here rather than taken from a caller, so a bug upstream
 * cannot spend somebody else's budget or exempt itself by passing a fresh one.
 */
export async function checkRateLimit(
  name: RateLimitName,
  subject: string,
): Promise<RateLimitResult> {
  const { limit, windowSeconds } = RATE_LIMITS[name];
  const key = `${name}:${subject.toLowerCase().trim()}`;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (error) throw new Error(error.message);

    const row = (data ?? {}) as unknown as Record<string, unknown>;

    return {
      allowed: row.allowed !== false,
      remaining: Number(row.remaining ?? 0),
      resetAt: typeof row.reset_at === "string" ? row.reset_at : null,
    };
  } catch (error) {
    console.error(`[rate-limit] ${name} check failed, allowing`, error);
    return { allowed: true, remaining: limit, resetAt: null };
  }
}

/** Counts a request and throws the user-facing refusal when it is over. */
export async function enforceRateLimit(
  name: RateLimitName,
  subject: string,
): Promise<void> {
  const result = await checkRateLimit(name, subject);
  if (result.allowed) return;

  const seconds = result.resetAt
    ? Math.max(
        1,
        Math.ceil((new Date(result.resetAt).getTime() - Date.now()) / 1000),
      )
    : RATE_LIMITS[name].windowSeconds;

  throw new AppError(
    ERROR_CODES.RATE_LIMITED,
    `That's a lot of requests at once. Try again in ${
      seconds > 90 ? `${Math.ceil(seconds / 60)} minutes` : `${seconds} seconds`
    }.`,
  );
}
