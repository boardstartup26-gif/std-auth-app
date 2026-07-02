// app/(auth)/forgot-password/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/app/_components/ThemeToggle";
import { createBrowserClient } from "@supabase/ssr";
import { authShell, backLink, btnPrimary, cardPadded, errorAlert, inputBase, sectionLabel } from "@/lib/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    );

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    });

    setPending(false);
    if (error) { setError(error.message); return; }
    setSent(true);
  };

  return (
    <div className={authShell}>
      <div className="mb-8 flex items-center justify-between">
        <Link href="/login" className={backLink}>← Back to login</Link>
        <ThemeToggle />
      </div>

      <div className={cardPadded}>
        <p className={sectionLabel}>BoardEdge</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Reset password
        </h1>

        {sent ? (
          <div className="mt-8 space-y-3">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Check <span className="font-medium text-zinc-950 dark:text-zinc-50">{email}</span> for a reset link. It expires in 1 hour.
            </p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              No email? Check spam, or{" "}
              <button
                className="underline underline-offset-2"
                onClick={() => setSent(false)}
              >
                try again
              </button>
              .
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400" htmlFor="email">
                Email
              </label>
              <input
                className={`${inputBase} h-11 w-full`}
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {error && <p className={errorAlert}>{error}</p>}

            <button className={btnPrimary} disabled={pending} type="submit">
              {pending ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}