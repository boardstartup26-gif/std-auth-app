"use client";

import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";

type AuthResult =
  | { ok: true }
  | { ok: false; message: string };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="inline-flex h-11 items-center justify-center rounded-md bg-black px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      disabled={pending}
      type="submit"
    >
      {pending ? "Working…" : label}
    </button>
  );
}

export function AuthForm({
  title,
  action,
  submitLabel,
  alternate,
}: {
  title: string;
  action: (
    prevState: AuthResult | null,
    formData: FormData,
  ) => Promise<AuthResult>;
  submitLabel: string;
  alternate: { href: string; label: string };
}) {
  const [state, formAction] = useFormState<AuthResult | null, FormData>(
    action,
    null,
  );

  return (
    <div className="mx-auto w-full max-w-md px-6 py-16">
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          {title}
        </h1>

        <form action={formAction} className="mt-8 space-y-4">
          <div className="space-y-1">
            <label
              className="text-sm font-medium text-zinc-900 dark:text-zinc-100"
              htmlFor="email"
            >
              Email
            </label>
            <input
              className="h-11 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none ring-0 placeholder:text-zinc-400 focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>

          <div className="space-y-1">
            <label
              className="text-sm font-medium text-zinc-900 dark:text-zinc-100"
              htmlFor="password"
            >
              Password
            </label>
            <input
              className="h-11 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none ring-0 placeholder:text-zinc-400 focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={6}
            />
          </div>

          {state?.ok === false ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
              {state.message}
            </p>
          ) : null}

          <div className="flex items-center justify-between">
            <SubmitButton label={submitLabel} />
            <Link
              className="text-sm font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
              href={alternate.href}
            >
              {alternate.label}
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

