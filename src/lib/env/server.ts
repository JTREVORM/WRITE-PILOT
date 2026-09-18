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
