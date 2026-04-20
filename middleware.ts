import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { getSupabasePublicEnv } from "@/lib/supabase/env"
import { updateSession } from "@/lib/supabase/session"

export async function middleware(request: NextRequest) {
  const { url, anonKey } = getSupabasePublicEnv()
  if (!url || !anonKey) {
    return NextResponse.next({ request })
  }

  // Refresh cookie session + propagate cookie updates.
  const response = await updateSession(request)

  // Protect dashboard routes at the edge/server boundary.
  if (request.nextUrl.pathname.startsWith("/dashboard")) {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
          if (headers) {
            Object.entries(headers).forEach(([k, v]) => {
              if (typeof v === "string") response.headers.set(k, v)
            })
          }
        },
      },
    })

    const { data, error } = await supabase.auth.getClaims()
    if (error || !data?.claims?.sub) {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = "/login"
      loginUrl.searchParams.set("next", request.nextUrl.pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}

