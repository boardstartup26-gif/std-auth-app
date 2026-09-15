// src/lib/credits.ts
//
// One place that knows how a credit balance is computed, so the dashboard, the
// top bar and /api/usage cannot drift apart on the window arithmetic. It
// reuses getUsageWindowStartIST, which mirrors `p_date - 6` inside the
// increment_usage RPC — if that ever changes, all three move together.

import { createAdminClient } from "@/lib/supabase/server";
import { WEEKLY_CREDIT_LIMIT } from "@/lib/constants";
import { getUsageDateIST, getUsageWindowStartIST } from "@/lib/usage-date";

export interface CreditBalance {
  used: number;
  remaining: number;
  limit: number;
}

export async function readCredits(userId: string): Promise<CreditBalance> {
  const today = getUsageDateIST();
  const { data, error } = await createAdminClient()
    .from("usage")
    .select("token_count")
    .eq("user_id", userId)
    .gte("usage_date", getUsageWindowStartIST(today))
    .lte("usage_date", today);

  if (error) {
    // A failed read must not read as "no credits left" — that would block a
    // student who actually has a full balance. Report the full allowance and
    // let the evaluate route, which reserves atomically, be the real gate.
    console.error("[BoardEdge] credit balance read failed:", error);
    return { used: 0, remaining: WEEKLY_CREDIT_LIMIT, limit: WEEKLY_CREDIT_LIMIT };
  }

  const used = (data ?? []).reduce((sum, row) => sum + row.token_count, 0);
  return {
    used,
    remaining: Math.max(0, WEEKLY_CREDIT_LIMIT - used),
    limit: WEEKLY_CREDIT_LIMIT,
  };
}
