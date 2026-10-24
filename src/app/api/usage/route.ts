import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readCredits } from "@/lib/credits";

export async function GET() {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // readCredits owns the window arithmetic and the per-student limit
  // (base + referral bonus), so this can't drift from the dashboard.
  // `daily_limit` is a legacy wire name; the value is the weekly limit.
  const credits = await readCredits(user.id);
  return NextResponse.json({
    tokens_used: credits.used,
    tokens_remaining: credits.remaining,
    daily_limit: credits.limit,
  });
}
