import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { getSupabasePublicEnv } from "@/lib/supabase/env";

/**
 * Refreshes the Supabase session from cookies and forwards updated cookies on the response.
 * Call from `proxy.ts` so Server Components receive a valid JWT (use `getClaims()` there for auth checks).
 */
export async function updateSession(request: NextRequest) {
  const { url, anonKey } = getSupabasePublicEnv();
  if (!url || !anonKey) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
        if (headers) {
          Object.entries(headers).forEach(([k, v]) => {
            if (typeof v === "string") supabaseResponse.headers.set(k, v);
          });
        }
      },
    },
  });

  await supabase.auth.getClaims();

  return supabaseResponse;
}
