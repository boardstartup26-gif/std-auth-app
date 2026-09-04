// app/auth/callback/route.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { after, NextRequest, NextResponse } from "next/server";
import { EVENTS } from "@/lib/analytics/events";
import { recordServerEvent } from "@/lib/analytics/server";

// Google's PKCE exchange gives back a user but not a "was this a signup"
// flag. For a first-ever sign-in Supabase stamps created_at and
// last_sign_in_at within the same request, so a small window between them
// separates a new account from a returning one. Generous enough to absorb
// clock skew, far shorter than any real gap between visits.
const NEW_ACCOUNT_WINDOW_MS = 60_000;

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const type = searchParams.get("type"); // "recovery" for password reset

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,  // ← your key name
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // A password-recovery exchange is neither a signup nor a login —
      // counting it as either would inflate the conversion step.
      if (type === "recovery") {
        return NextResponse.redirect(`${origin}/auth/reset-password`);
      }

      const user = data.user;
      const createdAt = user?.created_at ? Date.parse(user.created_at) : null;
      const lastSignInAt = user?.last_sign_in_at ? Date.parse(user.last_sign_in_at) : null;
      const isNewAccount =
        createdAt !== null &&
        (lastSignInAt === null || lastSignInAt - createdAt < NEW_ACCOUNT_WINDOW_MS);

      after(() =>
        recordServerEvent({
          eventName: isNewAccount ? EVENTS.SIGNUP_COMPLETED : EVENTS.LOGIN_COMPLETED,
          userId: user?.id ?? null,
          properties: { method: "google" },
          path: "/auth/callback",
        }),
      );

      return NextResponse.redirect(`${origin}/dashboard`);
    }

    after(() =>
      recordServerEvent({
        eventName: EVENTS.AUTH_FAILED,
        properties: { action: "oauth_callback", method: "google", reason: error.message },
        path: "/auth/callback",
      }),
    );
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}