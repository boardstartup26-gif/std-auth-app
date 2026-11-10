// src/lib/progress/streak.ts
//
// Marks Recovered Streak: consecutive weeks in which the student won back at
// least one mark on a reattempt. Pure.
//
// Weekly, not daily: a daily streak punishes a student for a school day off
// and rewards logging in over improving. Weeks run Monday to Sunday in IST
// (Asia/Kolkata), the same calendar the token economy uses, and line up with
// the Weekly Board Plan. The current week still counts as "alive" until it
// ends: a streak isn't broken on a Tuesday just because nothing has been
// recovered yet this week.

import { roundMarks } from "./attempts";
import type { RecoveryEvent } from "./gain";

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 330 * 60 * 1000; // UTC+5:30, no DST

/** Monday (YYYY-MM-DD, IST calendar) of the week containing `at`. */
export function weekStartIST(at: number | string): string {
  const t = typeof at === "number" ? at : Date.parse(at);
  const ist = new Date(t + IST_OFFSET_MS);
  const sinceMonday = (ist.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - sinceMonday * DAY_MS);
  return monday.toISOString().slice(0, 10);
}

function shiftWeek(weekStart: string, weeks: number): string {
  return new Date(Date.parse(`${weekStart}T00:00:00Z`) + weeks * 7 * DAY_MS).toISOString().slice(0, 10);
}

export interface RecoveryStreak {
  /** Consecutive qualifying weeks ending this week (or last week, if this week has none yet). */
  current: number;
  best: number;
  thisWeek: string;
  thisWeekMarks: number;
  /** False means the streak is alive but needs a recovery before the week ends. */
  thisWeekCounted: boolean;
}

export function computeStreak(recoveries: RecoveryEvent[], now: number = Date.now()): RecoveryStreak {
  const marksByWeek = new Map<string, number>();
  for (const e of recoveries) {
    if (e.marks <= 0) continue;
    const w = weekStartIST(e.at);
    marksByWeek.set(w, (marksByWeek.get(w) ?? 0) + e.marks);
  }

  const thisWeek = weekStartIST(now);
  const thisWeekCounted = marksByWeek.has(thisWeek);

  let current = 0;
  for (let w = thisWeekCounted ? thisWeek : shiftWeek(thisWeek, -1); marksByWeek.has(w); w = shiftWeek(w, -1)) {
    current += 1;
  }

  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const w of [...marksByWeek.keys()].sort()) {
    run = prev !== null && shiftWeek(prev, 1) === w ? run + 1 : 1;
    best = Math.max(best, run);
    prev = w;
  }

  return {
    current,
    best: Math.max(best, current),
    thisWeek,
    thisWeekMarks: roundMarks(marksByWeek.get(thisWeek) ?? 0),
    thisWeekCounted,
  };
}
