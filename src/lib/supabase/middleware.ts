import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env/public";
import type { Database } from "@/types/database";

/**
 * Refreshes the Supabase session on every matched request and returns both the
 * user and the response carrying any rotated auth cookies.
 *
 * This runs in the middleware because Server Components cannot write cookies;
 * without it a user's session would silently expire mid-visit.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          response = NextResponse.next({ request });

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() revalidates the token against Supabase Auth. getSession() only
  // decodes the cookie, which a client could have tampered with, so it must not
  // be used for an authorisation decision.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
