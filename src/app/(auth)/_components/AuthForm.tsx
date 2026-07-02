// app/(auth)/_components/AuthForm.tsx
"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { ThemeToggle } from "@/app/_components/ThemeToggle";
import { createBrowserClient } from "@supabase/ssr";
import {
  authShell,
  backLink,
  btnPrimary,
  cardPadded,
  errorAlert,
  inputBase,
  sectionLabel,
} from "@/lib/ui";

type AuthResult = { ok: true } | { ok: false; message: string };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={btnPrimary} disabled={pending} type="submit">
      {pending ? "Working…" : label}
    </button>
  );
}

function GoogleButton() {
  const handleGoogleSignIn = async () => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    );
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <button
      type="button"
      onClick={handleGoogleSignIn}
      className="flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-zinc-200 bg-white text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
    >
      {/* Google G SVG */}
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <path
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          fill="#4285F4"
        />
        <path
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          fill="#34A853"
        />
        <path
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
          fill="#FBBC05"
        />
        <path
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          fill="#EA4335"
        />
      </svg>
      Continue with Google
    </button>
  );
}

export function AuthForm({
  title,
  action,
  submitLabel,
  alternate,
  showForgotPassword = false,
}: {
  title: string;
  action: (prevState: AuthResult | null, formData: FormData) => Promise<AuthResult>;
  submitLabel: string;
  alternate: { href: string; label: string };
  showForgotPassword?: boolean;
}) {
  const [state, formAction] = useActionState<AuthResult | null, FormData>(action, null);

  const inputClass = `${inputBase} h-11 w-full placeholder:text-zinc-400 dark:placeholder:text-zinc-500`;

  return (
    <div className={authShell}>
      <div className="mb-8 flex items-center justify-between">
        <Link href="/" className={backLink}>
          ← Home
        </Link>
        <ThemeToggle />
      </div>

      <div className={cardPadded}>
        <p className={sectionLabel}>BoardEdge</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          {title}
        </h1>

        {/* Google OAuth */}
        <div className="mt-8">
          <GoogleButton />
        </div>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-white px-3 text-xs text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500">
              or
            </span>
          </div>
        </div>

        {/* Email/Password form */}
        <form action={formAction} className="space-y-5">
          <div className="space-y-2">
            <label
              className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
              htmlFor="email"
            >
              Email
            </label>
            <input
              className={inputClass}
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
                htmlFor="password"
              >
                Password
              </label>
              {showForgotPassword && (
                <Link
                  href="/forgot-password"
                  className="text-xs text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400"
                >
                  Forgot password?
                </Link>
              )}
            </div>
            <input
              className={inputClass}
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={6}
            />
          </div>

          {state?.ok === false ? <p className={errorAlert}>{state.message}</p> : null}

          <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
            <SubmitButton label={submitLabel} />
            <Link className={backLink} href={alternate.href}>
              {alternate.label}
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}