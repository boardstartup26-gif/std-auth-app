// src/lib/parent-report/content.ts
//
// What a weekly Parent Report says. Pure: no React, no Supabase.
//
// Built from the same lib/progress derivation as everything the student sees,
// so a parent can't be told a figure the student's own dashboard contradicts.
// Deliberately narrow: activity, marks, marks won back, the kinds of slips and
// where — never answer text, examiner feedback or model answers. Those stay
// the student's.

import { buildProgressSnapshot } from "@/lib/progress";
import { emptyReasons, reasonsFor, topReasons } from "@/lib/progress/leakage";
import { roundMarks } from "@/lib/progress/attempts";
import { LEAK_REASONS, type LeakReason, type ProgressAttempt } from "@/lib/progress/types";

const DAY_MS = 24 * 60 * 60 * 1000;
export const REPORT_PERIOD_DAYS = 7;

export interface ReasonTrend {
  reason: LeakReason;
  thisWeek: number;
  lastWeek: number;
}

export interface ParentReport {
  periodStart: string;
  periodEnd: string;
  answers: number;
  answersLastWeek: number;
  writtenAnswers: number;
  scored: number;
  possible: number;
  marksRecovered: number;
  streakWeeks: number;
  /** Most frequent slips this week, with last week's count beside them. */
  reasons: ReasonTrend[];
  weakest: { subject: string; chapter: string } | null;
  subjects: string[];
  plan: { completed: number; total: number } | null;
}

/** The report for the REPORT_PERIOD_DAYS ending at `now`. */
export function buildParentReport(
  attempts: ProgressAttempt[],
  now: number,
  plan: { completed: number; total: number } | null = null,
): ParentReport {
  const start = now - REPORT_PERIOD_DAYS * DAY_MS;
  const prevStart = start - REPORT_PERIOD_DAYS * DAY_MS;
  const inRange = (a: ProgressAttempt, from: number, to: number) => {
    const t = Date.parse(a.submittedAt);
    return t > from && t <= to;
  };
  const week = attempts.filter((a) => inRange(a, start, now));
  const lastWeek = attempts.filter((a) => inRange(a, prevStart, start));

  const count = (list: ProgressAttempt[]) => {
    const r = emptyReasons();
    for (const a of list) {
      const x = reasonsFor(a);
      for (const k of LEAK_REASONS) r[k] += x[k];
    }
    return r;
  };
  const thisCounts = count(week);
  const lastCounts = count(lastWeek);

  const snap = buildProgressSnapshot(attempts, now);
  const recovered = snap.gain.recoveries
    .filter((e) => {
      const t = Date.parse(e.at);
      return t > start && t <= now;
    })
    .reduce((s, e) => s + e.marks, 0);
  const weakest = snap.weakest[0];

  return {
    periodStart: new Date(start).toISOString(),
    periodEnd: new Date(now).toISOString(),
    answers: week.length,
    answersLastWeek: lastWeek.length,
    writtenAnswers: week.filter((a) => a.written).length,
    scored: roundMarks(week.reduce((s, a) => s + a.awarded, 0)),
    possible: roundMarks(week.reduce((s, a) => s + a.total, 0)),
    marksRecovered: roundMarks(recovered),
    streakWeeks: snap.streak.current,
    reasons: topReasons(thisCounts, 3).map(({ reason, count: n }) => ({
      reason,
      thisWeek: n,
      lastWeek: lastCounts[reason],
    })),
    weakest: weakest ? { subject: weakest.subject, chapter: weakest.chapter } : null,
    subjects: [...new Set(week.map((a) => a.subject))].sort(),
    plan,
  };
}
