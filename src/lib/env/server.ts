import "server-only";

import { z } from "zod";

/**
 * Server-only environment. The `server-only` import above makes importing this
 * module from a Client Component a build error, which is the mechanical
 * guarantee that the service-role key can never reach a browser bundle.
 *
 * Optional values are genuinely optional: the application must boot and behave
 * sensibly when an integration has not been configured yet, rather than
 * pretending a feature works. Callers check `isEmailConfigured` and friends.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  /**
   * Bypasses Row Level Security. Used only by src/lib/supabase/admin.ts for
   * credit, subscription and usage mutations that users must not perform.
   */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),

  /** Transactional email (Resend). Auth emails are sent by Supabase itself. */
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  RESEND_REPLY_TO_EMAIL: z.string().email().optional(),

  /**
   * AI provider. Optional so the application boots, and every AI feature
   * reports itself as unavailable, rather than crashing when no key is set.
   */
  AI_PROVIDER: z.enum(["anthropic"]).default("anthropic"),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  /** Overridable so a model can be changed without a deploy. */
  AI_MODEL: z.string().min(1).default("claude-opus-5"),
  /** Upper bound on a single analysis, in milliseconds. */
  AI_TIMEOUT_MS: z.coerce.number().int().positive().max(600_000).default(120_000),

  /**
   * Payments (Stripe). Optional, like every other integration: without them
   * the plan catalogue is still shown and every purchase path reports itself
   * as unavailable rather than failing at the point of payment.
   *
   * The webhook secret is separate from the API key and is what makes an
   * incoming request trustworthy. Without it, no webhook is accepted at all --
   * an unverified body is an unauthenticated instruction to grant credits.
   */
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
});

const parsed = serverEnvSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");

  throw new Error(`Invalid server environment configuration.\n${details}`);
}

export const serverEnv = parsed.data;

/** True when privileged server-side mutations (credits, plans) are available. */
export const isServiceRoleConfigured = Boolean(serverEnv.SUPABASE_SERVICE_ROLE_KEY);

/** True when transactional email can actually be delivered. */
export const isEmailConfigured = Boolean(
  serverEnv.RESEND_API_KEY && serverEnv.RESEND_FROM_EMAIL,
);

export const isProduction = serverEnv.NODE_ENV === "production";

/** True when AI features can actually run. */
export const isAiConfigured = Boolean(serverEnv.ANTHROPIC_API_KEY);

/**
 * True when a user can actually be charged.
 *
 * Deliberately requires the service-role key as well: a checkout that
 * completed with no way to write the resulting plan change would take money
 * and deliver nothing.
 */
export const isPaymentsConfigured = Boolean(
  serverEnv.STRIPE_SECRET_KEY && serverEnv.SUPABASE_SERVICE_ROLE_KEY,
);

/** True when an incoming webhook can be verified, and therefore accepted. */
export const isWebhookConfigured = Boolean(serverEnv.STRIPE_WEBHOOK_SECRET);
