"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { createBrowserClient } from "@supabase/ssr";
import {
  backLink,
  btnPrimary,
  errorAlert,
  inputBase,
  sectionLabel,
} from "@/lib/ui";
import { EVENTS } from "@/lib/analytics/events";
import { track } from "@/lib/analytics/track";
import { POLICIES } from "@/lib/legal/policies";
import { NEXT_COOKIE } from "@/lib/safe-next";

type AuthResult = { ok: true } | { ok: false; message: string };

/**
 * Which side of the auth funnel this form is on. Only the signup flow emits
 * SIGNUP_STARTED — firing it from the login page too would make the
 * signup-intent → signup-completed step look far worse than it is.
 */
type AuthFlow = "login" | "signup";

const legalLink = "text-foreground underline underline-offset-2 hover:text-accent";

function SubmitButton({ label, disabled = false }: { label: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className={`${btnPrimary} w-full`} disabled={pending || disabled} type="submit">
      {pending ? "Working…" : label}
    </button>
  );
}

/**
 * Google leaves the site and comes back through /auth/callback, so `next`
 * can't ride along in the form. It goes in a short-lived cookie instead —
 * not in redirectTo's query string, which Supabase's redirect allowlist may
 * not match. Cleared when there is no destination, so a stale one from an
 * abandoned attempt can't hijack a later login.
 */
function rememberNext(next: string | undefined) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = next
    ? `${NEXT_COOKIE}=${encodeURIComponent(next)}; Max-Age=600; Path=/; SameSite=Lax${secure}`
    : `${NEXT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
}

function GoogleButton({
  flow,
  disabled = false,
  next,
}: {
  flow: AuthFlow;
  disabled?: boolean;
  next?: string;
}) {
  const handleGoogleSignIn = async () => {
    if (disabled) return;
    rememberNext(next);
    if (flow === "signup") {
      // Beacon dispatch: the OAuth redirect tears this document down
      // immediately after, and a plain fetch would be cancelled with it.
      track(EVENTS.SIGNUP_STARTED, { method: "google" }, { beacon: true });
    }
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    );
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <button
      type="button"
      onClick={handleGoogleSignIn}
      disabled={disabled}
      aria-describedby={flow === "signup" ? "google-consent-hint" : "login-legal-notice"}
      className="flex h-11 w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-border bg-card text-sm font-medium text-foreground transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-card"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
      </svg>
      Continue with Google
    </button>
  );
}

/**
 * Required agreement on the signup form. Controlled so the Google button above
 * can be gated on the same state — and so React's post-action form reset
 * doesn't untick it when a signup attempt comes back with an error.
 *
 * `required` is a courtesy only; signup() in (auth)/actions.ts re-checks
 * `accept_policies` and refuses without it.
 */
function ConsentCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        id="accept_policies"
        name="accept_policies"
        type="checkbox"
        required
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-accent"
      />
      <label htmlFor="accept_policies" className="text-xs leading-relaxed text-muted-foreground">
        I agree to the{" "}
        <Link href={POLICIES.terms.href} target="_blank" className={legalLink}>
          {POLICIES.terms.title}
        </Link>{" "}
        and{" "}
        <Link href={POLICIES.privacy.href} target="_blank" className={legalLink}>
          {POLICIES.privacy.title}
        </Link>
        . If I&apos;m under 18, my parent or guardian has agreed to them too.
      </label>
    </div>
  );
}

/**
 * Left-half brand panel. `imageSrc` is a single swap point — pass a real
 * photo/illustration path later and this panel switches from the CSS glow
 * treatment to that image with no layout changes.
 */
export function BrandPanel({ imageSrc }: { imageSrc?: string }) {
  return (
    <div className="relative hidden overflow-hidden bg-card md:flex md:w-1/2 md:flex-col md:items-center md:justify-center">
      {imageSrc ? (
        <Image src={imageSrc} alt="" fill className="object-cover" priority />
      ) : (
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,var(--glow-purple),transparent_65%)] opacity-25"
        />
      )}
      {/* Login/signup are logged-out-only routes (middleware never gates
          them), so the landing page is always the right destination — no
          auth branching needed the way the public landing page itself needs
          one for its own logo. */}
      <Link
        href="/"
        className="relative flex flex-col items-center gap-4 px-10 text-center rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Image src="/logo-icon.png" alt="BoardEdge" width={56} height={56} priority />
        <span className="text-xl font-semibold tracking-tight text-foreground">BoardEdge</span>
      </Link>
    </div>
  );
}

export function AuthForm({
  title,
  action,
  submitLabel,
  alternate,
  showForgotPassword = false,
  nameFields = false,
  imageSrc,
  next,
}: {
  title: string;
  action: (prevState: AuthResult | null, formData: FormData) => Promise<AuthResult>;
  submitLabel: string;
  alternate: { href: string; label: string };
  showForgotPassword?: boolean;
  nameFields?: boolean;
  imageSrc?: string;
  /** Validated same-site path to return to after login. */
  next?: string;
}) {
  const [state, formAction] = useActionState<AuthResult | null, FormData>(action, null);
  const [accepted, setAccepted] = useState(false);
  const inputClass = `${inputBase} h-11 w-full placeholder:text-muted-foreground`;
  // The name fields are what distinguish the signup form from the login form;
  // no caller has to pass the flow separately and get it out of step.
  const flow: AuthFlow = nameFields ? "signup" : "login";
  const needsConsent = flow === "signup" && !accepted;

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground md:flex-row">
      <BrandPanel imageSrc={imageSrc} />

      <div className="flex flex-1 flex-col justify-center px-6 py-12 md:px-16 lg:px-24">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between md:hidden">
            <Link href="/" className={backLink}>← Home</Link>
          </div>

          <p className={sectionLabel}>BoardEdge</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{title}</h1>

          <div className="mt-8">
            {/* A Google sign-in creates the account without ever submitting
                the form below, so on signup the agreement has to gate this
                button too, not just the password path. */}
            <GoogleButton flow={flow} disabled={needsConsent} next={next} />
            {flow === "signup" ? (
              <p id="google-consent-hint" className="mt-2 text-center text-xs text-muted-foreground">
                {needsConsent
                  ? "Tick the agreement below to continue with Google."
                  : "You've agreed to the Terms and Privacy Policy."}
              </p>
            ) : null}
          </div>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-background px-3 text-xs text-muted-foreground">or</span>
            </div>
          </div>

          <form
            action={formAction}
            onSubmit={() => {
              // Intent, not success. The matching SIGNUP_COMPLETED is recorded
              // server-side in (auth)/actions.ts, so the gap between the two is
              // exactly the drop-off this step is meant to expose.
              if (flow === "signup") track(EVENTS.SIGNUP_STARTED, { method: "password" });
            }}
            className="space-y-5"
          >
            {next ? <input type="hidden" name="next" value={next} /> : null}
            {nameFields && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="first_name">First name</label>
                  <input className={inputClass} id="first_name" name="first_name" type="text" autoComplete="given-name" required />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="last_name">Last name</label>
                  <input className={inputClass} id="last_name" name="last_name" type="text" autoComplete="family-name" required />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="email">Email</label>
              <input className={inputClass} id="email" name="email" type="email" autoComplete="email" required />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="password">Password</label>
                {showForgotPassword && (
                  <Link href="/forgot-password" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                    Forgot password?
                  </Link>
                )}
              </div>
              <input className={inputClass} id="password" name="password" type="password" autoComplete="current-password" required minLength={6} />
            </div>

            {flow === "signup" ? (
              <>
                {/* Checked again server-side in signup(): valid format and
                    not the student's own address. */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="parent_email">
                    Parent or guardian email
                  </label>
                  <input
                    className={inputClass}
                    id="parent_email"
                    name="parent_email"
                    type="email"
                    autoComplete="off"
                    required
                    aria-describedby="parent_email_hint"
                  />
                  <p id="parent_email_hint" className="text-xs leading-relaxed text-muted-foreground">
                    We&apos;ll email them a link to approve. You can explore right away; grading
                    unlocks once they confirm.
                  </p>
                </div>
                <ConsentCheckbox checked={accepted} onChange={setAccepted} />
              </>
            ) : null}

            {state?.ok === false ? <p className={errorAlert}>{state.message}</p> : null}

            <div className="space-y-3 pt-1">
              <SubmitButton label={submitLabel} disabled={needsConsent} />
              <p className="text-center text-sm text-muted-foreground">
                <Link className="text-foreground underline-offset-2 hover:underline" href={alternate.href}>{alternate.label}</Link>
              </p>
            </div>
          </form>

          {/* On login this notice is the consent for a first-time Google
              user: the callback creates their account and records agreement,
              and this is the text they saw beside the button. */}
          {flow === "login" ? (
            <p id="login-legal-notice" className="mt-8 text-center text-xs leading-relaxed text-muted-foreground">
              By continuing, you agree to BoardEdge&apos;s{" "}
              <Link href={POLICIES.terms.href} className={legalLink}>{POLICIES.terms.title}</Link>{" "}
              and{" "}
              <Link href={POLICIES.privacy.href} className={legalLink}>{POLICIES.privacy.title}</Link>.
            </p>
          ) : (
            <p className="mt-8 flex justify-center gap-4 text-xs text-muted-foreground">
              <Link href={POLICIES.privacy.href} className="hover:text-foreground">{POLICIES.privacy.title}</Link>
              <Link href={POLICIES.terms.href} className="hover:text-foreground">{POLICIES.terms.title}</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
