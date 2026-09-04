// src/app/admin/layout.tsx
//
// First of the guards on /admin and everything under it.
//
// A layout alone is NOT sufficient authorisation in the App Router: layouts and
// pages render in parallel, and a layout does not re-render on every client-side
// navigation between sibling routes. So this is the outer lock, not the only
// one — the page's own data fetch calls requireAdmin() again, and
// getDashboardMetrics() calls it a third time before it will read a single row.
// Any one of those three failing shuts the door.

import type { Metadata } from "next";
import { requireAdmin } from "@/lib/analytics/admin";

export const metadata: Metadata = {
  title: "BoardEdge — Telemetry",
  // Belt and braces. Non-admins already get a 404, which is the real defence
  // against indexing; this covers the case of a crawler somehow holding a
  // session cookie.
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // notFound() for anyone who isn't an admin — signed out, signed in as a
  // student, or unknown. A 403 would confirm the route exists; a 404 is
  // indistinguishable from a mistyped URL.
  await requireAdmin();
  return <>{children}</>;
}
