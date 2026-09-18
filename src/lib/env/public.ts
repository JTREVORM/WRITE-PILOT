import { z } from "zod";

/**
 * Environment available to both the server and the browser bundle.
 *
 * Every value here is compiled into client-side JavaScript, so nothing secret
 * may ever be added to this file. Secrets belong in `./server.ts`, which is
 * protected by the `server-only` import guard.
 *
 * Next.js inlines `process.env.NEXT_PUBLIC_*` at build time only when it is
 * referenced as a literal member expression, which is why the keys below are
 * spelled out rather than read from a loop.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(20, "NEXT_PUBLIC_SUPABASE_ANON_KEY looks malformed"),
  /** Absolute origin, used to build auth redirect URLs that must match exactly. */
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
});

const parsed = publicEnvSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL:
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined),
});

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");

  throw new Error(
    `Invalid public environment configuration.\n${details}\n\n` +
      "Copy .env.example to .env.local and fill in the Supabase values.",
  );
}

export const publicEnv = parsed.data;
export type PublicEnv = typeof publicEnv;
