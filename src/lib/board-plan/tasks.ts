// src/lib/board-plan/tasks.ts
//
// The Weekly Board Plan's rules. Pure: no React, no Supabase, client-safe.
//
// Three tasks a week, chosen from the student's own marked answers through
// lib/progress — no model call, so a task can't claim a weakness the marking
// didn't find:
//   1. Reattempt  — the written question with the most marks still lost.
//   2. Chapter    — practise the weakest chapters (the Fix List's targets).
//   3. Habit      — aimed at the most frequent leak reason.
// Gaps (a new student with no reattempt candidate, say) are filled from
// generic tasks so a plan always has distinct, doable work.
//
// Every task has a numeric target, and progress is counted from attempts
// submitted after the plan was created. Nothing is ticked by hand.

import { reattemptHref, questionLabel, formatMarks } from "@/lib/notifications/reattempt-copy";
import { isRealPoint } from "@/lib/history";
import { latestPerQuestion } from "@/lib/progress/attempts";
import { topReasons, weakestChapters } from "@/lib/progress/leakage";
import type { ProgressSnapshot } from "@/lib/progress";
import type { LeakReason, ProgressAttempt } from "@/lib/progress/types";

// ─── Task shapes (stored as JSON in weekly_plans.tasks) ──────────────────────

interface QuestionRef {
  questionId: string;
  subject: string;
  year: number | null;
  questionNumber: string;
}

export type PlanTask =
  | ({ kind: "reattempt"; scoreAtPlan: number; total: number; target: 1 } & QuestionRef)
  | { kind: "chapter_practice"; subject: string; chapters: string[]; target: number }
  | { kind: "full_marks"; target: number }
  | { kind: "objective_correct"; target: number }
  | { kind: "clean_presentation"; target: number }
  | { kind: "conceptual_redo"; questions: QuestionRef[]; target: number }
  | { kind: "written_count"; target: number };

export type PlanTaskKind = PlanTask["kind"];

const ref = (a: ProgressAttempt): QuestionRef => ({
  questionId: a.questionId,
  subject: a.subject,
  year: a.year,
  questionNumber: a.questionNumber,
});

// ─── Generation ──────────────────────────────────────────────────────────────

const lostFirst = (a: ProgressAttempt, b: ProgressAttempt) =>
  b.total - b.awarded - (a.total - a.awarded) || Date.parse(b.submittedAt) - Date.parse(a.submittedAt);

function habitFor(reason: LeakReason, latestOpen: ProgressAttempt[], exclude: string | null): PlanTask | null {
  switch (reason) {
    case "point_missed":
    case "point_partial":
      return { kind: "full_marks", target: 2 };
    case "objective_wrong":
      return { kind: "objective_correct", target: 5 };
    case "presentation":
      return { kind: "clean_presentation", target: 3 };
    case "conceptual": {
      const qs = latestOpen
        .filter((a) => a.written && a.questionId !== exclude && (a.conceptualErrors ?? []).some(isRealPoint))
        .sort(lostFirst)
        .slice(0, 5)
        .map(ref);
      return qs.length ? { kind: "conceptual_redo", questions: qs, target: Math.min(2, qs.length) } : null;
    }
  }
}

const FALLBACKS: PlanTask[] = [
  { kind: "written_count", target: 3 },
  { kind: "full_marks", target: 2 },
  { kind: "objective_correct", target: 5 },
];

/** The week's tasks, or [] when there's nothing to base a plan on. */
export function generatePlanTasks(attempts: ProgressAttempt[], snap: ProgressSnapshot): PlanTask[] {
  if (!attempts.length) return [];
  const tasks: PlanTask[] = [];
  const latestOpen = latestPerQuestion(attempts).filter((a) => a.awarded < a.total);

  const worst = latestOpen.filter((a) => a.written).sort(lostFirst)[0];
  if (worst) {
    tasks.push({ kind: "reattempt", ...ref(worst), scoreAtPlan: worst.awarded, total: worst.total, target: 1 });
  }

  const weakest = snap.weakest[0];
  if (weakest) {
    const chapters = weakestChapters(snap.leakage, { subject: weakest.subject, limit: 2 }).map((c) => c.chapter);
    tasks.push({ kind: "chapter_practice", subject: weakest.subject, chapters, target: 3 });
  }

  for (const { reason } of topReasons(snap.leakage.reasons, 5)) {
    const habit = habitFor(reason, latestOpen, worst?.questionId ?? null);
    if (habit && !tasks.some((t) => t.kind === habit.kind)) {
      tasks.push(habit);
      break;
    }
  }

  for (const f of FALLBACKS) {
    if (tasks.length >= 3) break;
    if (!tasks.some((t) => t.kind === f.kind)) tasks.push(f);
  }
  return tasks.slice(0, 3);
}

// ─── Progress ────────────────────────────────────────────────────────────────

export interface TaskProgress {
  done: number;
  target: number;
  complete: boolean;
  /** reattempt only: best mark since the plan began, if attempted. */
  bestSince?: number;
}

/** Progress on one task from the attempts made since the plan was created. */
export function taskProgress(task: PlanTask, since: ProgressAttempt[]): TaskProgress {
  const count = (pred: (a: ProgressAttempt) => boolean) => since.filter(pred).length;
  const full = (a: ProgressAttempt) => a.awarded >= a.total;
  let done: number;
  let bestSince: number | undefined;

  switch (task.kind) {
    case "reattempt": {
      const tries = since.filter((a) => a.questionId === task.questionId);
      done = tries.length ? 1 : 0;
      if (tries.length) bestSince = Math.max(...tries.map((a) => a.awarded));
      break;
    }
    case "chapter_practice": {
      const set = new Set(task.chapters);
      done = count((a) => a.subject === task.subject && a.chapter !== null && set.has(a.chapter));
      break;
    }
    case "full_marks":
      done = count((a) => a.written && full(a));
      break;
    case "objective_correct":
      done = count((a) => !a.written && full(a));
      break;
    case "clean_presentation":
      // Only evaluations that recorded presentation at all can count.
      done = count((a) => a.written && a.styleIssues !== null && !a.styleIssues.some(isRealPoint));
      break;
    case "conceptual_redo": {
      const ids = new Set(task.questions.map((q) => q.questionId));
      done = new Set(since.filter((a) => ids.has(a.questionId)).map((a) => a.questionId)).size;
      break;
    }
    case "written_count":
      done = count((a) => a.written);
      break;
  }
  return { done: Math.min(done, task.target), target: task.target, complete: done >= task.target, bestSince };
}

export function attemptsSince(attempts: ProgressAttempt[], createdAt: string): ProgressAttempt[] {
  const t = Date.parse(createdAt);
  return attempts.filter((a) => Date.parse(a.submittedAt) > t);
}

// ─── Copy ────────────────────────────────────────────────────────────────────
// Shared by the dashboard card, the inbox notification, the email and the
// WhatsApp share text, so the plan reads the same everywhere.

export interface TaskCopy {
  title: string;
  detail: string;
  /** Internal path, or null when the action is the Fix List form. */
  href: string | null;
  fixListSubject?: string;
}

const listJoin = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function taskCopy(task: PlanTask, progress?: TaskProgress): TaskCopy {
  switch (task.kind) {
    case "reattempt": {
      const gained =
        progress?.bestSince !== undefined && progress.bestSince > task.scoreAtPlan
          ? ` +${formatMarks(progress.bestSince - task.scoreAtPlan)} won back.`
          : "";
      return {
        title: `Rewrite ${questionLabel(task)}`,
        detail: `You scored ${formatMarks(task.scoreAtPlan)}/${formatMarks(task.total)} — your biggest open loss.${gained}`,
        href: reattemptHref(task),
      };
    }
    case "chapter_practice":
      return {
        title: `Practise ${listJoin(task.chapters)}`,
        detail: `Answer ${task.target} ${task.subject} questions from your weakest ${task.chapters.length > 1 ? "chapters" : "chapter"}. A Fix List does it in one go.`,
        href: null,
        fixListSubject: task.subject,
      };
    case "full_marks":
      return {
        title: `Score full marks on ${task.target} written answers`,
        detail: "Missing scheme points is your most common slip. Before you submit, check every point the question asks for.",
        href: "/evaluate",
      };
    case "objective_correct":
      return {
        title: `Get ${task.target} objective questions right`,
        detail: "Objective slips are the quickest marks to win back.",
        href: "/evaluate",
      };
    case "clean_presentation":
      return {
        title: `Write ${task.target} answers with no presentation slips`,
        detail: "Use the exact terms the marking scheme expects, set out point by point.",
        href: "/evaluate",
      };
    case "conceptual_redo": {
      const next = task.questions[0];
      return {
        title: `Redo ${task.target} ${task.target === 1 ? "answer" : "answers"} with a conceptual error`,
        detail: `Starting with ${questionLabel(next)}. Re-read the model answer first, then write it from memory.`,
        href: reattemptHref(next),
      };
    }
    case "written_count":
      return {
        title: `Answer ${task.target} written questions`,
        detail: "Each one is marked point by point against the official scheme.",
        href: "/evaluate",
      };
  }
}

/** Plain-text plan for the WhatsApp share and the email's text part. */
export function planAsText(tasks: PlanTask[]): string {
  return tasks.map((t, i) => `${i + 1}. ${taskCopy(t).title}`).join("\n");
}
