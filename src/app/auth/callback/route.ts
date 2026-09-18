import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { routes, safeRedirectPath } from "@/lib/config/routes";
import { sendWelcomeIfFirstTime } from "@/lib/notifications/welcome";

/**
 * PKCE code exchange.
 *
 * Handles the `?code=` links produced by OAuth sign-in and by Supabase's
 * default email templates. The companion route at /auth/confirm handles the
 * `token_hash` form used by customised templates; supporting both means email
 * verification works whichever template a project is configured with.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeRedirectPath(searchParams.get("next"), routes.dashboard);

  // The provider reports a refused or expired consent this way.
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (error) {
    const url = new URL(routes.authError, origin);
    url.searchParams.set("reason", errorDescription ?? error);
    return NextResponse.redirect(url);
  }

  if (!code) {
    return NextResponse.redirect(new URL(routes.authError, origin));
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    const url = new URL(routes.authError, origin);
    url.searchParams.set("reason", exchangeError.message);
    return NextResponse.redirect(url);
  }

  // The session now exists, so this runs as the signed-in user and is scoped by
  // RLS. It is once-per-account and never throws, so it cannot block the
  // redirect that completes sign-in.
  await sendWelcomeIfFirstTime();

  return NextResponse.redirect(new URL(next, origin));
}
