// app/auth/reset-password/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { BrandPanel } from "@/app/(auth)/_components/AuthForm";
import { btnPrimary, errorAlert, inputBase, sectionLabel } from "@/lib/ui";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }

    setPending(true);

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    );

    const { error } = await supabase.auth.updateUser({ password });
    setPending(false);

    if (error) { setError(error.message); return; }
    router.push("/dashboard");
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground md:flex-row">
      <BrandPanel />

      <div className="flex flex-1 flex-col justify-center px-6 py-12 md:px-16 lg:px-24">
        <div className="mx-auto w-full max-w-sm">
          <p className={sectionLabel}>BoardEdge</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            Set new password
          </h1>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="password">
                New password
              </label>
              <input
                className={`${inputBase} h-11 w-full`}
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="confirm">
                Confirm password
              </label>
              <input
                className={`${inputBase} h-11 w-full`}
                id="confirm"
                type="password"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>

            {error && <p className={errorAlert}>{error}</p>}

            <button className={`${btnPrimary} w-full`} disabled={pending} type="submit">
              {pending ? "Updating…" : "Update password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
