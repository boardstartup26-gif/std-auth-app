// src/lib/progress/leakage.ts
//
// Where and why marks are lost. Pure: no React, no Supabase.
//
// Two different kinds of figure, kept apart on purpose:
//   - WHERE (chapters, totals) is in marks, and exact: total − awarded on the
//     latest attempt at each question.
//   - WHY (reasons) is a count of occurrences, never marks. Most stored rows
//     only have the flat points_missed list (no per-point marks), and
//     conceptual errors never carry marks, so attributing lost marks to
//     reasons would invent numbers a parent report would then present as fact.

import { isRealPoint } from "@/lib/history";
import { latestPerQuestion, roundMarks } from "./attempts";
import { LEAK_REASONS, type LeakReason, type ProgressAttempt, type ReasonCounts } from "./types";

export function emptyReasons(): ReasonCounts {
  return Object.fromEntries(LEAK_REASONS.map((r) => [r, 0])) as ReasonCounts;
}

const realCount = (xs: string[] | null) => (xs ?? []).filter(isRealPoint).length;

/**
 * Reasons one attempt lost marks. A full-marks attempt contributes nothing:
 * this map is about marks lost, and a presentation note on an answer that
 * still earned every mark didn't cost one.
 */
export function reasonsFor(a: ProgressAttempt): ReasonCounts {
  const counts = emptyReasons();
  if (a.awarded >= a.total) return counts;

  if (!a.written) {
    counts.objective_wrong = 1;
    return counts;
  }

  // Prefer the structured shape; fall back to the flat list almost every
  // older row still uses (see the note at the top of lib/history.ts).
  const points = (a.markingPoints ?? []).filter((p) => p && isRealPoint(p.point));
  if (points.length) {
    counts.point_missed = points.filter((p) => p.status === "missed").length;
    counts.point_partial = points.filter((p) => p.status === "partial").length;
  } else {
    counts.point_missed = realCount(a.pointsMissed);
  }
  counts.conceptual = realCount(a.conceptualErrors);
  counts.presentation = realCount(a.styleIssues);
  return counts;
}

function addReasons(into: ReasonCounts, from: ReasonCounts): void {
  for (const r of LEAK_REASONS) into[r] += from[r];
}

export interface ChapterLeak {
  subject: string;
  /** null = questions with no chapter recorded; never offered as a Fix List target. */
  chapter: string | null;
  lost: number;
  possible: number;
  questions: number;
  questionsBelowFull: number;
  reasons: ReasonCounts;
}

export interface LeakageSummary {
  lost: number;
  possible: number;
  questions: number;
  questionsBelowFull: number;
  reasons: ReasonCounts;
  /** Most marks lost first. */
  byChapter: ChapterLeak[];
  /**
   * Written questions whose latest evaluation recorded presentation issues at
   * all (icse_style_issues not NULL). Lets the UI say the presentation figure
   * covers only part of the history instead of implying a clean record.
   */
  presentationTracked: number;
  writtenQuestions: number;
}

export function computeLeakage(attempts: ProgressAttempt[]): LeakageSummary {
  const latest = latestPerQuestion(attempts);
  const reasons = emptyReasons();
  const chapters = new Map<string, ChapterLeak>();
  let lost = 0;
  let possible = 0;
  let belowFull = 0;
  let presentationTracked = 0;
  let writtenQuestions = 0;

  for (const a of latest) {
    const loss = a.total - a.awarded;
    const r = reasonsFor(a);
    lost += loss;
    possible += a.total;
    if (loss > 0) belowFull += 1;
    addReasons(reasons, r);
    if (a.written) {
      writtenQuestions += 1;
      if (a.styleIssues !== null) presentationTracked += 1;
    }

    const key = `${a.subject}\u0000${a.chapter ?? ""}`;
    const c =
      chapters.get(key) ??
      { subject: a.subject, chapter: a.chapter, lost: 0, possible: 0, questions: 0, questionsBelowFull: 0, reasons: emptyReasons() };
    c.lost += loss;
    c.possible += a.total;
    c.questions += 1;
    if (loss > 0) c.questionsBelowFull += 1;
    addReasons(c.reasons, r);
    chapters.set(key, c);
  }

  const byChapter = [...chapters.values()]
    .map((c) => ({ ...c, lost: roundMarks(c.lost), possible: roundMarks(c.possible) }))
    .sort(
      (a, b) =>
        b.lost - a.lost ||
        b.lost / b.possible - a.lost / a.possible ||
        (a.chapter ?? "￿").localeCompare(b.chapter ?? "￿"),
    );

  return {
    lost: roundMarks(lost),
    possible: roundMarks(possible),
    questions: latest.length,
    questionsBelowFull: belowFull,
    reasons,
    byChapter,
    presentationTracked,
    writtenQuestions,
  };
}

/** Reasons that actually occurred, most frequent first. */
export function topReasons(reasons: ReasonCounts, limit = 3): { reason: LeakReason; count: number }[] {
  return LEAK_REASONS.map((reason) => ({ reason, count: reasons[reason] }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export const WEAK_CHAPTER_MIN_QUESTIONS = 2;

/**
 * Chapters to target, weakest first: highest share of available marks lost,
 * then most marks lost. A rate, not a raw total, so a chapter the student has
 * simply practised more doesn't look weaker for it; the minimum question
 * count keeps one bad answer from naming a chapter. Chapterless questions are
 * excluded — there's nothing to build a Fix List from.
 */
export function weakestChapters(
  leakage: LeakageSummary,
  { subject, minQuestions = WEAK_CHAPTER_MIN_QUESTIONS, limit = 3 }: { subject?: string; minQuestions?: number; limit?: number } = {},
): (ChapterLeak & { chapter: string })[] {
  return leakage.byChapter
    .filter(
      (c): c is ChapterLeak & { chapter: string } =>
        c.chapter !== null &&
        c.lost > 0 &&
        c.questions >= minQuestions &&
        (subject === undefined || c.subject === subject),
    )
    .sort((a, b) => b.lost / b.possible - a.lost / a.possible || b.lost - a.lost)
    .slice(0, limit);
}
