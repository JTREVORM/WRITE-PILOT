"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env/public";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { toAppError } from "@/lib/utils/errors";
import { routes, safeRedirectPath } from "@/lib/config/routes";
import { ok, fail, type ActionResult } from "@/lib/utils/result";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from "@/lib/validation/auth";
import type { ZodError } from "zod";

/**
 * Authentication server actions.
 *
 * Each one revalidates its input server-side, regardless of what the browser
 * checked, and returns an ActionResult the form can render. Messages are
 * deliberately non-committal about whether an account exists — see the
 * enumeration notes below.
 */

function fieldErrorsFrom(error: ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    (result[key] ??= []).push(issue.message);
  }
  return result;
}

/**
 * Builds an absolute redirect target for an auth email.
 *
 * Prefers the configured site URL (which must be allow-listed in Supabase) and
 * falls back to the request origin so preview deployments work without extra
 * configuration.
 */
async function absoluteUrl(path: string) {
  const configured = publicEnv.NEXT_PUBLIC_SITE_URL;
  if (configured && !configured.includes("localhost")) {
    return new URL(path, configured).toString();
  }

  const headerList = await headers();
  const origin =
    headerList.get("origin") ??
    (headerList.get("host")
      ? `${headerList.get("x-forwarded-proto") ?? "http"}://${headerList.get("host")}`
      : configured);

  return new URL(path, origin).toString();
}

// -----------------------------------------------------------------------------
// Registration
// -----------------------------------------------------------------------------

export async function signUpAction(
  _prevState: ActionResult<{ email: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ email: string }>> {
  const parsed = registerSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    userType: formData.get("userType") ?? "student",
    country: formData.get("country") ?? "",
    timezone: formData.get("timezone") ?? undefined,
    marketingOptIn: formData.get("marketingOptIn") === "on",
    acceptTerms: formData.get("acceptTerms") === "on",
  });

  if (!parsed.success) {
    return fail("Please correct the highlighted fields.", {
      fieldErrors: fieldErrorsFrom(parsed.error),
    });
  }

  const input = parsed.data;

  // Keyed on the address being registered, so one mailbox cannot be used to
  // mint accounts in a loop.
  const limited = await refuseIfLimited("signUp", input.email);
  if (limited) return limited;

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: await absoluteUrl(
        `${routes.authCallback}?next=${encodeURIComponent(routes.dashboard)}`,
      ),
      // Read by the handle_new_user trigger to populate the profile row.
      data: {
        full_name: input.fullName,
        user_type: input.userType,
        country: input.country || null,
        timezone: input.timezone || "UTC",
        marketing_opt_in: input.marketingOptIn,
      },
    },
  });

  if (error) {
    // Rate limits are worth naming precisely; everything else stays generic.
    if (error.status === 429) {
      return fail("Too many attempts. Please wait a minute and try again.", {
        code: "rate_limited",
      });
    }
    return fail(error.message, { code: "signup_failed" });
  }

  // When the address is already registered, Supabase returns a user with an
  // empty identities array rather than an error. Reporting that difference
  // would let anyone test which addresses have accounts, so both paths return
  // the same "check your email" outcome.
  const alreadyRegistered =
    data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0;

  if (alreadyRegistered) {
    return ok({ email: input.email });
  }

  return ok({ email: input.email });
}

// -----------------------------------------------------------------------------
// Sign in / sign out
// -----------------------------------------------------------------------------

export async function signInAction(
  _prevState: ActionResult<never> | null,
  formData: FormData,
): Promise<ActionResult<never>> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return fail("Please correct the highlighted fields.", {
      fieldErrors: fieldErrorsFrom(parsed.error),
    });
  }

  // Keyed on the address being attempted rather than on a session, because an
  // attacker guessing passwords has no session to key on.
  const limited = await refuseIfLimited("signIn", parsed.data.email);
  if (limited) return limited;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    if (error.status === 429) {
      return fail("Too many sign-in attempts. Please wait a minute.", {
        code: "rate_limited",
      });
    }
    if (error.message.toLowerCase().includes("email not confirmed")) {
      return fail(
        "Please confirm your email address first — check your inbox for the verification link.",
        { code: "email_not_confirmed" },
      );
    }
    // One message for both "no such user" and "wrong password", so the form
    // cannot be used to discover which addresses are registered.
    return fail("That email and password combination isn't correct.", {
      code: "invalid_credentials",
    });
  }

  const nextPath = safeRedirectPath(
    formData.get("next")?.toString(),
    routes.dashboard,
  );

  revalidatePath("/", "layout");
  // Redirecting from the action rather than the client avoids rendering the
  // signed-out form for a frame after a successful sign-in.
  redirect(nextPath);
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect(routes.login);
}

// -----------------------------------------------------------------------------
// Password reset
// -----------------------------------------------------------------------------

export async function requestPasswordResetAction(
  _prevState: ActionResult<{ email: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ email: string }>> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return fail("Enter a valid email address.", {
      fieldErrors: fieldErrorsFrom(parsed.error),
    });
  }

  const limited = await refuseIfLimited("passwordReset", parsed.data.email);
  if (limited) return limited;

  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    {
      redirectTo: await absoluteUrl(
        `${routes.authConfirm}?next=${encodeURIComponent(routes.resetPassword)}`,
      ),
    },
  );

  // Deliberately not surfaced: whether the address exists is not something an
  // unauthenticated caller should be able to learn. Genuine delivery problems
  // are visible in the server logs and the Supabase dashboard.
  if (error && error.status !== 429) {
    console.error("[auth] password reset request failed", error.message);
  }

  if (error?.status === 429) {
    return fail("Too many requests. Please wait a minute and try again.", {
      code: "rate_limited",
    });
  }

  return ok({ email: parsed.data.email });
}

export async function updatePasswordAction(
  _prevState: ActionResult<never> | null,
  formData: FormData,
): Promise<ActionResult<never>> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return fail("Please correct the highlighted fields.", {
      fieldErrors: fieldErrorsFrom(parsed.error),
    });
  }

  const supabase = await createClient();

  // A recovery link establishes a real session, so this call is authenticated.
  // Without one it fails, which is what stops a stranger resetting a password.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return fail(
      "This password reset link has expired. Please request a new one.",
      { code: "session_expired" },
    );
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return fail(error.message, { code: "update_failed" });
  }

  revalidatePath("/", "layout");
  redirect(routes.dashboard);
}

/**
 * Re-sends the signup confirmation email.
 *
 * Offered from the dashboard when an account is still unconfirmed. Like the
 * reset flow, the response says the same thing whether or not there was
 * anything to send.
 */
export async function resendVerificationAction(): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return fail("Please sign in to continue.", { code: "not_authenticated" });
  }

  if (user.email_confirmed_at) {
    return ok(null);
  }

  const { error } = await supabase.auth.resend({
    type: "signup",
    email: user.email,
    options: {
      emailRedirectTo: await absoluteUrl(
        `${routes.authCallback}?next=${encodeURIComponent(routes.dashboard)}`,
      ),
    },
  });

  if (error?.status === 429) {
    return fail("Too many requests. Please wait a minute and try again.", {
      code: "rate_limited",
    });
  }

  if (error) {
    console.error("[auth] resend verification failed", error.message);
  }

  return ok(null);
}

// -----------------------------------------------------------------------------
// Profile
// -----------------------------------------------------------------------------

export async function updateProfileAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const parsed = updateProfileSchema.safeParse({
    fullName: formData.get("fullName"),
    country: formData.get("country") ?? "",
    timezone: formData.get("timezone") ?? undefined,
    userType: formData.get("userType"),
    marketingOptIn: formData.get("marketingOptIn") === "on",
  });

  if (!parsed.success) {
    return fail("Please correct the highlighted fields.", {
      fieldErrors: fieldErrorsFrom(parsed.error),
    });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return fail("Please sign in to update your profile.", {
      code: "not_authenticated",
    });
  }

  // Only display fields are sent. Even if more were, the profiles column guard
  // in the database would restore the protected ones.
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      country: parsed.data.country || null,
      timezone: parsed.data.timezone || "UTC",
      user_type: parsed.data.userType,
      marketing_opt_in: parsed.data.marketingOptIn,
    })
    .eq("id", user.id);

  if (error) {
    console.error("[profile] update failed", error.message);
    return fail("We couldn't save your changes. Please try again.", {
      code: "update_failed",
    });
  }

  revalidatePath(routes.settings);
  revalidatePath(routes.dashboard);
  return ok(null);
}

/**
 * Counts an attempt and turns a refusal into a form error.
 *
 * Supabase applies its own limits; these sit in front of them so an attacker
 * cannot spend the project's shared budget, and so the refusal is a message a
 * person can read rather than a generic 429.
 */
async function refuseIfLimited(
  name: "signIn" | "signUp" | "passwordReset",
  email: string,
): Promise<ActionResult<never> | null> {
  try {
    await enforceRateLimit(name, email);
    return null;
  } catch (error) {
    const appError = toAppError(error);
    return fail(appError.message, { code: appError.code });
  }
}
