"use client";

// Inline error: where the content would have been, in the same tokens the app
// already uses for wrong/blocked states (status-wrong on its own wash — the
// `errorAlert` family in ui.ts). It always says three things: what didn't
// happen, that the student's work is safe, and what to do next — and the one
// thing to do is a button that works.
//
// Never given an Error object. Callers pass a message they wrote (or one from
// lib/request.ts), so a raw technical string has no route onto the screen.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { btnSecondary } from "@/lib/ui";

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  retrying = false,
  retryLabel = "Try again",
  secondary,
  className = "",
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  retryLabel?: string;
  /** A way out that isn't "try again": a link, or an onClick when it changes local state. */
  secondary?: { label: string; href?: string; onClick?: () => void };
  className?: string;
}) {
  const secondaryClass =
    "text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline";
  return (
    <div
      role="alert"
      className={`rounded-xl border border-status-wrong bg-status-wrong-subtle p-4 ${className}`}
    >
      <p className="text-sm font-semibold text-status-wrong">{title}</p>
      <p className="mt-1 max-w-[var(--measure)] text-sm leading-relaxed text-foreground/80">{message}</p>
      {onRetry || secondary ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              aria-busy={retrying}
              className={`${btnSecondary} !py-1.5 disabled:opacity-60`}
            >
              {retrying ? "Retrying…" : retryLabel}
            </button>
          ) : null}
          {secondary?.href ? (
            <Link href={secondary.href} className={secondaryClass}>
              {secondary.label}
            </Link>
          ) : secondary ? (
            <button type="button" onClick={secondary.onClick} className={secondaryClass}>
              {secondary.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * ErrorState for a server-rendered page whose data failed to load. "Try again"
 * re-runs the page's server work in place (router.refresh) inside a transition,
 * so the button shows "Retrying…" and the rest of the page stays interactive.
 */
export function ReloadableError(props: Omit<React.ComponentProps<typeof ErrorState>, "onRetry" | "retrying">) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <ErrorState {...props} retrying={pending} onRetry={() => start(() => router.refresh())} />;
}
