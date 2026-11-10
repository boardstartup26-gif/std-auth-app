"use client";

// Last resort: the root layout itself failed, so there is no app shell, no
// fonts and no providers — this file replaces the whole document. It imports the
// stylesheet directly (global-error renders outside the root layout, so nothing
// else would), and stays dependency-free so that the thing that broke can't
// break the page that reports it. Plain <a>, not <Link>: the router may be what
// failed.

import "./globals.css";

export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body>
        <main role="alert" className="mx-auto min-h-dvh max-w-2xl px-6 py-24">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Something went wrong</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground text-balance">
            BoardEdge couldn’t load
          </h1>
          <p className="mt-5 max-w-[68ch] text-muted-foreground">
            This is on our side, not yours. Anything you’ve already saved is safe. Try again, and if it keeps
            happening, come back in a few minutes.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => retry()}
              className="inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-background shadow-sm transition-colors hover:bg-accent-hover"
            >
              Try again
            </button>
            {/* A plain anchor on purpose: a full document load is the point here,
                and it must not depend on the router that may have just failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-border"
            >
              Go to BoardEdge
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
