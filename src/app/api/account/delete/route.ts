// app/api/account/delete/route.ts
//
// Self-serve account deletion — the Privacy Policy promises it from the
// Account page, so a failure here is a compliance problem, not just a bug.
//
// Deleting the auth user cascades to profiles, student_answers (→ evaluations),
// usage, usage_feedback, policy_consents and parent_consents; analytics_events
// keeps its rows with user_id set to NULL. Any table referencing auth.users
// without ON DELETE CASCADE / SET NULL makes this call fail outright — check
// new foreign keys against it.
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST() {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const supabase = createAdminClient();
  const { error } = await supabase.auth.admin.deleteUser(user.id);
  if (error) {
    // Raw provider errors can name tables and constraints (e.g. a foreign key
    // blocking the delete) — log them, don't return them.
    console.error("[BoardEdge] account deletion failed:", error);
    return NextResponse.json(
      { error: "We couldn't delete your account. Please try again, or email contact.boardedge@gmail.com." },
      { status: 500 }
    );
  }

  // The user no longer exists, but the browser still holds their session
  // cookies. Clear them here so the redirect to /login starts clean. The
  // sign-out API call itself may fail for a deleted user; supabase-js removes
  // the local session regardless, and deletion has already succeeded.
  try {
    await supabaseAuth.auth.signOut({ scope: "local" });
  } catch (err) {
    console.warn("[BoardEdge] post-deletion sign-out failed:", err);
  }

  return NextResponse.json({ success: true });
}
