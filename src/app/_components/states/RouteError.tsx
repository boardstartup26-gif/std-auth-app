"use client";

// The page-level fallback behind every error.tsx. A render or data failure that
// reaches a boundary lands here: one calm screen in the app's own type, a
// button that re-runs the segment, and a way out. It never prints the error —
// `message` on a server-originated error is a placeholder in production and a
// stack-adjacent string in development; neither belongs in front of a student.
// The opaque `digest` is shown as a reference, which is what support needs to
// find the matching server log and tells the student nothing technical.

import { useEffect, useTransition } from "react";
import Link from "next/link";
import { btnPrimary, btnSecondary, sectionLabel } from "@/lib/ui";
import { useOnline } from "@/lib/use-online";

function digestOf(error: unknown): string | null {
  if (error && typeof error === "object" && "digest" in error) {
    const d = (error as { digest?: unknown }).digest;
    return typeof d === "string" && d ? d : null;
  }
  return null;
}

export function RouteError({
  error,
  retry,
  home = { label: "Back to dashboard", href: "/dashboard" },
  contained = true,
}: {
  error: unknown;
  retry: () => void;
  home?: { label: string; href: string };
  /** Adds the page's own gutters. False when the boundary already sits in a padded shell. */
  contained?: boolean;
}) {
  const online = useOnline();
  const [pending, start] = useTransition();
  const digest = digestOf(error);

  useEffect(() => {
    // Digest only: the full error is already in the server log under it.
    console.error("[BoardEdge] page error", digest ?? "(client)");
  }, [digest]);

  return (
    <div role="alert" className={contained ? "mx-auto min-h-[60vh] max-w-2xl px-6 py-16" : ""}>
      <p className={sectionLabel}>{online ? "Something went wrong" : "No connection"}</p>
      <h1 className="display-section mt-3 text-balance">
        {online ? "We couldn’t load this page" : "You’re offline"}
      </h1>
      <p className="mt-5 max-w-[var(--measure)] text-muted-foreground">
        {online
          ? "This is on our side, not yours. Anything you’ve already saved is safe. Try again, and if it keeps happening, come back in a few minutes."
          : "Reconnect to the internet, then try again. Anything you’ve already saved is safe."}
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => start(() => retry())}
          disabled={pending}
          aria-busy={pending}
          className={btnPrimary}
        >
          {pending ? "Retrying…" : "Try again"}
        </button>
        <Link href={home.href} className={btnSecondary}>
          {home.label}
        </Link>
      </div>
      {digest ? <p className="mt-6 text-xs text-muted-foreground">Reference: {digest}</p> : null}
    </div>
  );
}
