"use client";

// The landing page's logo, wherever it appears (nav, footer) — it is the one
// logo instance in the app that can't hardcode its destination. Every other
// copy lives inside (protected)/layout.tsx and can just point at /dashboard,
// because middleware has already refused anyone not signed in; this one sits
// on the public marketing page, which a signed-in student can just as easily
// land on from a bookmark or a shared link.
//
// A client component rather than a server-side session check in page.tsx on
// purpose: page.tsx does no data fetching today and is fully static —
// prerendered once at build time, served instantly to the anonymous visitors
// who are the overwhelming majority of landing-page traffic. Reading the
// session server-side would make every hit of the marketing page wait on a
// Supabase round trip just to resolve one link. This checks client-side
// after the static shell has already painted, so the only visitor who ever
// sees the link update under them is a signed-in student looking at their
// own marketing page — and the swap happens before they've had time to read
// the header, let alone click it.
//
// Starts pointed at "/": that's correct for the anonymous case (most of
// traffic) with zero flash, and it's also what a server-rendered static page
// has to emit before any client code has run, so this is the only choice
// that can't itself cause a hydration mismatch.

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export function HomeLogoLink({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const [href, setHref] = useState("/");

  useEffect(() => {
    let cancelled = false;
    createClient()
      .auth.getUser()
      .then(({ data: { user } }) => {
        if (!cancelled && user) setHref("/dashboard");
      })
      .catch(() => {
        // A stale/missing refresh token throws here (AuthApiError). It just
        // means "not logged in" — the default "/" href is already correct,
        // so there is nothing to do but stop it from becoming an unhandled
        // promise rejection.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
