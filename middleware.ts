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

export async function middleware(request: NextRequest) {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();

  // If env vars aren't set yet, don't block dev; just continue.
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
  const isDashboardRoute = pathname.startsWith("/dashboard");

  if (!user && isDashboardRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
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

