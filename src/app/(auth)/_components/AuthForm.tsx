"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
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

export function AuthForm({
  title,
  action,
  submitLabel,
  alternate,
}: {
  title: string;
  action: (prevState: AuthResult | null, formData: FormData) => Promise<AuthResult>;
  submitLabel: string;
  alternate: { href: string; label: string };
}) {
  const [state, formAction] = useActionState<AuthResult | null, FormData>(action, null);

  const inputClass = `${inputBase} h-11 w-full placeholder:text-zinc-400 dark:placeholder:text-zinc-500`;

  return (
    <div className={authShell}>
      <div className="mb-8">
        <Link href="/" className={backLink}>
          ← Home
        </Link>
      </div>

      <div className={cardPadded}>
        <p className={sectionLabel}>BoardEdge</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          {title}
        </h1>

        <form action={formAction} className="mt-8 space-y-5">
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
            <label
              className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
              htmlFor="password"
            >
              Password
            </label>
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
