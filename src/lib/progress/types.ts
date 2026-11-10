// src/lib/progress/types.ts
//
// Shapes shared by the progress module. Client-safe: no Supabase, no server
// imports, so view models built from these can be handed to the browser.
//
// The progress module is the single derivation layer behind the Leakage Map,
// Reattempt Gain, the Marks Recovered Streak, the Fix List, the Weekly Board
// Plan and the Parent Report. Every one of those reads the same attempts and
// the same functions, so a figure can't mean one thing on the dashboard and
// another in a parent's inbox.

import type { MarkingPoint } from "@/lib/history";

/** One graded attempt, normalised. Unscored rows never reach this type. */
export interface ProgressAttempt {
  answerId: string;
  questionId: string;
  submittedAt: string;
  subject: string;
  /** null where the question was imported before chapters existed. */
  chapter: string | null;
  questionNumber: string;
  year: number | null;
  /** Examiner-graded (subjective). Objective/MCQ answers are false. */
  written: boolean;
  total: number;
  awarded: number;
  markingPoints: MarkingPoint[] | null;
  pointsMissed: string[] | null;
  conceptualErrors: string[] | null;
  /** null = not recorded for this evaluation (older rows), not "none found". */
  styleIssues: string[] | null;
}

/**
 * Why marks were lost, as far as stored evaluations can say. Counted per
 * occurrence, never given marks: legacy points_missed rows carry no per-point
 * marks and conceptual errors never do, so splitting lost marks across
 * reasons would invent numbers.
 */
export const LEAK_REASONS = [
  "point_missed",
  "point_partial",
  "conceptual",
  "presentation",
  "objective_wrong",
] as const;
export type LeakReason = (typeof LEAK_REASONS)[number];

export const LEAK_REASON_LABELS: Record<LeakReason, string> = {
  point_missed: "Scheme point not made",
  point_partial: "Point only partly made",
  conceptual: "Conceptual error",
  presentation: "Presentation & terminology",
  objective_wrong: "Objective answer wrong",
};

export type ReasonCounts = Record<LeakReason, number>;
