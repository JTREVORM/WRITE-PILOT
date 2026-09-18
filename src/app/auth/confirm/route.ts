import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { routes, safeRedirectPath } from "@/lib/config/routes";
import { sendWelcomeIfFirstTime } from "@/lib/notifications/welcome";

/**
 * One-time-token verification.
 *
 * Handles `?token_hash=&type=` links — the form Supabase produces when the
 * email templates use `{{ .TokenHash }}`. Email confirmation, password recovery
 * and email-change flows all land here.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeRedirectPath(searchParams.get("next"), routes.dashboard);

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL(routes.authError, origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    const url = new URL(routes.authError, origin);
    // Expired links are the common case and deserve their own wording.
    url.searchParams.set(
      "reason",
      /expired|invalid/i.test(error.message) ? "expired" : error.message,
    );
    return NextResponse.redirect(url);
  }

  // Only a signup confirmation earns a welcome. A recovery or email-change
  // link lands here too, and neither is a new account.
  if (type === "signup" || type === "email") {
    await sendWelcomeIfFirstTime();
  }

  return NextResponse.redirect(new URL(next, origin));
}
