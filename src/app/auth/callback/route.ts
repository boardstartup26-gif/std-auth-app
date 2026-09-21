// app/auth/callback/route.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { after, NextRequest, NextResponse } from "next/server";
import { EVENTS } from "@/lib/analytics/events";
import { recordServerEvent } from "@/lib/analytics/server";
import { recordSignupConsent } from "@/lib/legal/consent";
import { sendWelcomeEmail } from "@/lib/email/welcome";

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

      // Google accounts are created here, not in the signup action, so this
      // is where their consent is recorded. Both auth screens state beside the
      // Google button that continuing means agreeing to the Terms and Privacy
      // Policy (and on /signup the button stays disabled until the checkbox is
      // ticked). The user id comes from the verified code exchange above;
      // the versions from policies.ts. Idempotent, never throws.
      if (isNewAccount && user) {
        await recordSignupConsent(user.id, "google_oauth");
      }

      // Welcome email — to the Google account's own address, only for a
      // genuine new signup (isNewAccount), never a returning login. Google's
      // metadata shape varies by what the user shared, so this tries a few
      // reasonable fields before falling back to a generic greeting.
      if (isNewAccount && user?.email) {
        const meta = user.user_metadata as Record<string, unknown> | undefined;
        const firstName =
          (typeof meta?.given_name === "string" && meta.given_name) ||
          (typeof meta?.full_name === "string" && meta.full_name.split(" ")[0]) ||
          (typeof meta?.name === "string" && meta.name.split(" ")[0]) ||
          null;
        const emailForWelcome = user.email;
        after(() => sendWelcomeEmail({ to: emailForWelcome, firstName }));
      }

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