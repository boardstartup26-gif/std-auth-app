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
  /**
   * When the next credits come back, and how many. Null when nothing is
   * currently spent — there is nothing pending to return.
   *
   * This is a rolling seven-day window, not a monthly reset, so credits do not
   * all return at one moment: each day's spend ages out on its own, seven IST
   * days after it happened. What is reported here is the *next* such moment and
   * only the credits attached to it, because saying "refills in 2d" while
   * implying the full allowance comes back would be wrong on every day except
   * the one where a single day's usage is all that is outstanding.
   */
  nextRefill: { at: string; amount: number } | null;
}

/**
 * Start of an IST calendar day, as a real instant. IST is UTC+5:30 with no
 * daylight saving, so the offset is a constant — but it is written out rather
 * than hardcoded as a magic number so the arithmetic is checkable.
 */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

function istMidnightUtc(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00Z`) - IST_OFFSET_MS;
}

export async function readCredits(userId: string): Promise<CreditBalance> {
  const today = getUsageDateIST();
  const { data, error } = await createAdminClient()
    .from("usage")
    .select("token_count, usage_date")
    .eq("user_id", userId)
    .gte("usage_date", getUsageWindowStartIST(today))
    .lte("usage_date", today);

  if (error) {
    // A failed read must not read as "no credits left" — that would block a
    // student who actually has a full balance. Report the full allowance and
    // let the evaluate route, which reserves atomically, be the real gate.
    console.error("[BoardEdge] credit balance read failed:", error);
    return {
      used: 0,
      remaining: WEEKLY_CREDIT_LIMIT,
      limit: WEEKLY_CREDIT_LIMIT,
      nextRefill: null,
    };
  }

  const rows = (data ?? []).filter((r) => r.token_count > 0);
  const used = rows.reduce((sum, row) => sum + row.token_count, 0);

  // The oldest day still inside the window is the next to leave it. A row dated
  // D stays in while today <= D + 6, so it ages out at the start of IST day
  // D + 7 — the same `p_date - 6` boundary increment_usage uses, read forwards.
  let nextRefill: CreditBalance["nextRefill"] = null;
  const oldest = rows
    .map((r) => r.usage_date as string)
    .sort()
    .at(0);
  if (oldest) {
    nextRefill = {
      at: new Date(istMidnightUtc(oldest) + 7 * 86_400_000).toISOString(),
      amount: rows
        .filter((r) => r.usage_date === oldest)
        .reduce((sum, r) => sum + r.token_count, 0),
    };
  }

  return {
    used,
    remaining: Math.max(0, WEEKLY_CREDIT_LIMIT - used),
    limit: WEEKLY_CREDIT_LIMIT,
    nextRefill,
  };
}
