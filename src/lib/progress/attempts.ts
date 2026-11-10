// src/lib/progress/attempts.ts
//
// Pure helpers for grouping attempts. No React, no Supabase.

import type { ProgressAttempt } from "./types";

/** Marks can be fractional (half marks); keep sums free of float noise. */
export function roundMarks(n: number): number {
  return Math.round(n * 100) / 100;
}

const byTime = (a: ProgressAttempt, b: ProgressAttempt) =>
  Date.parse(a.submittedAt) - Date.parse(b.submittedAt) || a.answerId.localeCompare(b.answerId);

/** Attempts per question, each list oldest first. */
export function groupByQuestion(attempts: ProgressAttempt[]): Map<string, ProgressAttempt[]> {
  const groups = new Map<string, ProgressAttempt[]>();
  for (const a of attempts) {
    const list = groups.get(a.questionId);
    if (list) list.push(a);
    else groups.set(a.questionId, [a]);
  }
  for (const list of groups.values()) list.sort(byTime);
  return groups;
}

/**
 * The latest attempt at each question: the student's current standing on it.
 * Marks lost on an earlier attempt and since recovered are not still lost.
 */
export function latestPerQuestion(attempts: ProgressAttempt[]): ProgressAttempt[] {
  return [...groupByQuestion(attempts).values()].map((list) => list[list.length - 1]);
}
