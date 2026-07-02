// app/api/waitlist/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// ─── POST /api/waitlist ─────────────────────────────────────────────────────
// Called by WaitlistCapture (see PremiumGate.tsx). Writes to a `waitlist`
// table — see the SQL migration in this handoff for the schema.
//
// NOTE: I don't have visibility into whether a route already exists at this
// path — if one does, diff it against this before overwriting.

interface WaitlistRequestBody {
  email: string;
  feature?: string;
}

export async function POST(req: NextRequest) {
  let body: WaitlistRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const feature = body.feature ?? "premium_bundle";

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // upsert on email so repeat submissions (e.g. re-triggering from a second
  // browser tab) don't create duplicate rows — just bump last_seen_at.
  const { error } = await supabase
    .from("waitlist")
    .upsert(
      {
        email,
        feature,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "email" }
    );

  if (error) {
    console.error("[BoardEdge] waitlist insert failed:", error);
    return NextResponse.json({ error: "Failed to join waitlist" }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 200 });
}