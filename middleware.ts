import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function getSupabaseUrl() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    ""
  );
}

function getSupabaseKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    ""
  );
}

function withCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((c) => to.cookies.set(c));
  return to;
}

// All routes that require an authenticated session.
// Adding a new page? If it needs auth, add its prefix here — don't rely
// on the page itself doing an auth check as the only protection.
//
// "/admin" is deliberately NOT in this list, and must not be added.
//
// Everything here redirects an unauthenticated visitor to /login, which
// confirms the route exists — fine for /dashboard, wrong for /admin. The
// admin routes instead return an ordinary 404 to anyone who isn't an admin
// (see src/lib/analytics/admin.ts), so a prober cannot tell /admin apart from
// a mistyped URL. Adding the prefix here would trade that away for nothing:
// the server layout, the page and the aggregator each re-check the role, so
// no unauthorised request gets data either way.
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/evaluate",
  "/history",
  "/account",
];

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();

  if (!url || !key) {
    return NextResponse.next();
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set({ name, value, ...options });
          response.cookies.set({ name, value, ...options });
        });
      },
    },
  });

  // Cryptographically verifies the session (doesn't trust cookie contents).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isAuthRoute = pathname === "/login" || pathname === "/signup";

  if (!user && isProtectedRoute(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    // Preserve the intended destination so you can redirect back post-login.
    redirectUrl.searchParams.set("next", pathname);
    return withCookies(response, NextResponse.redirect(redirectUrl));
  }

  if (user && isAuthRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    return withCookies(response, NextResponse.redirect(redirectUrl));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/|static/|favicon.ico).*)",
  ],
};