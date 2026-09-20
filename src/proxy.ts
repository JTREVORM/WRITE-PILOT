import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";
import { buildCsp, createNonce } from "@/lib/security/csp";
import {
  isAuthOnlyRoute,
  isProtectedRoute,
  routes,
  safeRedirectPath,
} from "@/lib/config/routes";

/**
 * Runs on every non-static request to refresh the Supabase session and to keep
 * signed-out visitors out of the application shell.
 *
 * Next.js 16 renamed this convention from `middleware` to `proxy`; the
 * behaviour and the edge-adjacent constraints are unchanged.
 *
 * This is a routing convenience, not the security boundary. It saves a
 * round-trip to a login page; it is Row Level Security and the server-side
 * guards in `src/lib/auth/guards.ts` that actually protect data. Role checks in
 * particular are deliberately *not* made here, because this layer would have to
 * trust a token claim it cannot cheaply verify against the database.
 *
 * It is also where the Content Security Policy is issued, because the policy
 * carries a per-request nonce and nothing further down the stack runs early
 * enough to mint one. Next reads the nonce back out of the request's own
 * `Content-Security-Policy` header and applies it to every script it emits,
 * which is what makes `'strict-dynamic'` workable without hand-tagging tags.
 */
export async function proxy(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildCsp({
    nonce,
    isDev: process.env.NODE_ENV === "development",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });

  // Next extracts the nonce from the *request* header during rendering, so it
  // has to be set on the way in as well as on the way out.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const { response, user } = await updateSession(request, requestHeaders);
  const { pathname, search } = request.nextUrl;

  response.headers.set("content-security-policy", csp);

  const withCsp = (redirect: NextResponse) => {
    redirect.headers.set("content-security-policy", csp);
    return redirect;
  };

  if (!user && isProtectedRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = routes.login;
    url.search = "";
    url.searchParams.set("next", `${pathname}${search}`);
    return withCsp(NextResponse.redirect(url));
  }

  if (user && isAuthOnlyRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = safeRedirectPath(
      request.nextUrl.searchParams.get("next"),
      routes.dashboard,
    );
    url.search = "";
    return withCsp(NextResponse.redirect(url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals and static assets. Auth cookies are
     * irrelevant for those, and matching them would add latency to every image.
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)",
  ],
};
