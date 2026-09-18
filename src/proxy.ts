import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";
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
 */
export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  if (!user && isProtectedRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = routes.login;
    url.search = "";
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  if (user && isAuthOnlyRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = safeRedirectPath(
      request.nextUrl.searchParams.get("next"),
      routes.dashboard,
    );
    url.search = "";
    return NextResponse.redirect(url);
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
