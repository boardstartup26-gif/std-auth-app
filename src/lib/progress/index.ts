// src/lib/progress/index.ts
//
// One call that derives every progress figure from one set of attempts, so a
// page, the weekly cron and the parent report can't compute them differently.
// Pure; pair with readProgressAttempts() from ./read on the server.

import { computeReattemptGain, type ReattemptGain } from "./gain";
import { computeLeakage, weakestChapters, type ChapterLeak, type LeakageSummary } from "./leakage";
import { computeStreak, type RecoveryStreak } from "./streak";
import type { ProgressAttempt } from "./types";

export interface ProgressSnapshot {
  attempts: number;
  leakage: LeakageSummary;
  gain: ReattemptGain;
  streak: RecoveryStreak;
  /** Never chapterless: weakestChapters() filters those out. */
  weakest: (ChapterLeak & { chapter: string })[];
}

export function buildProgressSnapshot(attempts: ProgressAttempt[], now: number = Date.now()): ProgressSnapshot {
  const leakage = computeLeakage(attempts);
  const gain = computeReattemptGain(attempts);
  return {
    attempts: attempts.length,
    leakage,
    gain,
    streak: computeStreak(gain.recoveries, now),
    weakest: weakestChapters(leakage),
  };
}

export * from "./types";
export { computeLeakage, reasonsFor, topReasons, weakestChapters } from "./leakage";
export type { ChapterLeak, LeakageSummary } from "./leakage";
export { computeReattemptGain } from "./gain";
export type { QuestionGain, ReattemptGain, RecoveryEvent } from "./gain";
export { computeStreak, weekStartIST } from "./streak";
export type { RecoveryStreak } from "./streak";
export { groupByQuestion, latestPerQuestion, roundMarks } from "./attempts";
