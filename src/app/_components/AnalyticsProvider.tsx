"use client";

// src/app/_components/AnalyticsProvider.tsx
//
// Mounted once in the root layout. It owns the two things that have to happen
// on every page regardless of which route the student is on:
//
//   * a page_view per navigation (the activity signal retention is computed
//     from, and the top of the acquisition funnel), and
//   * mirroring the anonymous visitor id into a cookie so server-recorded
//     events — signup, evaluation completion — can be joined back to the
//     anonymous session that led to them.
//
// It renders nothing.

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { EVENTS } from "@/lib/analytics/events";
import { getAnonId, track, trackFirstTouch } from "@/lib/analytics/track";

const ANON_COOKIE = "be_anon_id";
const ANON_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * localStorage is invisible to the server, so the anon id is copied into a
 * readable cookie. Not HttpOnly (the client owns the value) and carries no
 * privilege — it is a join key for funnel maths, nothing more.
 */
function mirrorAnonCookie(): void {
  try {
    const anonId = getAnonId();
    if (document.cookie.split("; ").includes(`${ANON_COOKIE}=${anonId}`)) return;
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      `${ANON_COOKIE}=${anonId}; path=/; max-age=${ANON_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  } catch {
    // Cookies blocked — server-side events simply stay unjoined.
  }
}

export function AnalyticsProvider() {
  const pathname = usePathname();
  // Strict Mode mounts effects twice in development. Without this guard every
  // dev page load would post two page_views and skew local numbers.
  const lastTracked = useRef<string | null>(null);

  useEffect(() => {
    mirrorAnonCookie();
    trackFirstTouch();
  }, []);

  useEffect(() => {
    if (!pathname || lastTracked.current === pathname) return;
    lastTracked.current = pathname;
    track(EVENTS.PAGE_VIEW, { path: pathname });
  }, [pathname]);

  return null;
}
