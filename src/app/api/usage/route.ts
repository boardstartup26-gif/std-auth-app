import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { WEEKLY_TOKEN_LIMIT } from "@/lib/constants";
import { getUsageDateIST, getUsageWindowStartIST } from "@/lib/usage-date";

export async function GET() {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const today = getUsageDateIST();
  const windowStart = getUsageWindowStartIST(today);

  const { data } = await supabase
    .from("usage")
    .select("token_count")
    .eq("user_id", user.id)
    .gte("usage_date", windowStart)
    .lte("usage_date", today);

  const used = (data ?? []).reduce((sum, row) => sum + row.token_count, 0);
  return NextResponse.json({
    tokens_used: used,
    tokens_remaining: Math.max(0, WEEKLY_TOKEN_LIMIT - used),
    daily_limit: WEEKLY_TOKEN_LIMIT,
  });
}
