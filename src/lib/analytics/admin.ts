// src/lib/analytics/admin.ts
//
// The single authorisation gate for everything under /admin.
//
// Two rules it exists to enforce:
//
//   1. The role is read on the server, from the database, using an identity
//      taken from a cryptographically verified session. Never from a cookie
//      value, a JWT claim the client could shape, or a prop.
//   2. Failure is a 404, not a 403. A 403 confirms that /admin exists and that
//      the caller found a real route; a 404 is indistinguishable from a typo,
//      so the dashboard cannot be enumerated by probing.

import { notFound, unstable_rethrow } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export interface AdminUser {
  id: string;
  email: string | null;
}

/**
 * Resolves the caller to an admin, or null. Null covers every failure —
 * signed out, no profile row, role 'student', database unreachable — because
 * every one of them means "do not show this person the dashboard".
 */
export async function getAdminUser(): Promise<AdminUser | null> {
  try {
    const supabaseAuth = await createClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user) return null;

    // The role lookup runs through the service-role client on purpose. The
    // identity above is already verified; reading the role through RLS as
    // well would make admin access depend on a policy staying correct, and a
    // future policy edit could silently lock the owner out of their own
    // dashboard. Authorisation is decided here, from the stored row.
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, role")
      .eq("id", user.id)
      .maybeSingle();

    if (error || !data || data.role !== "admin") return null;

    return { id: data.id, email: data.email ?? user.email ?? null };
  } catch (err) {
    // Next signals control flow with thrown errors — notFound(), redirect(),
    // and the "this route used cookies() so it cannot be static" error. Those
    // must escape. Swallowing the dynamic-rendering one is the dangerous case:
    // the build would then prerender /admin as a static 404 and every admin
    // would be locked out of a page that never runs again.
    unstable_rethrow(err);
    // Anything genuinely unexpected must not fall through to "allowed".
    console.error("[BoardEdge] admin check failed:", err);
    return null;
  }
}

/**
 * Guard for admin server components and route handlers. Renders the 404 for
 * anyone who is not an admin, so an unauthorised visitor sees exactly what a
 * visitor to a nonexistent URL sees.
 */
export async function requireAdmin(): Promise<AdminUser> {
  const admin = await getAdminUser();
  if (!admin) notFound();
  return admin;
}
