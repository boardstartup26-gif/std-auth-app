import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data } = await supabase
    .from("usage")
    .select("token_count")
    .eq("user_id", user.id)
    .eq("usage_date", today)
    .maybeSingle();

  const used = data?.token_count ?? 0;
  return NextResponse.json({
    tokens_used: used,
    tokens_remaining: Math.max(0, 10 - used),
    daily_limit: 10,
  });
}