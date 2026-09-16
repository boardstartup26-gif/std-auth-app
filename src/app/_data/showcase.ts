// The single real evaluation the landing page is built around (handoff §6).
//
// Act 1 shows this answer being written; Act 2 marks it. Same record, one
// source — the narrative only works if the answer the visitor watches being
// written is the one they then watch being marked.
//
// The record itself lives in `src/lib/data/act2-showcase.json`, the path §6
// names, in the shipped `EvaluationOutput` shape field-for-field. This module
// is a typed view over it, not a second copy: `SHOWCASE` below renames a few
// fields for the camelCase call sites in Act 1 and reads every value from the
// JSON, so the two cannot drift.
//
// Everything in that file is real: the extracted 2024 ICSE History & Civics
// question, the founder's own submitted answer, and the output a real
// evaluation returned against it (student_answers 31af6db8, evaluations
// fb64a4d0). It was regenerated straight from those rows rather than
// transcribed, so no examiner-facing string is a paraphrase. It is the
// founder's own answer rather than a student's because a real student's
// submission is theirs, not ours to publish.
//
// One reconstruction, stated plainly: that evaluation row predates the
// `marking_points[]` column, so it stored `points_hit`/`points_missed` with no
// `matched_text`. The quotes were therefore derived — each awarded point's
// matched_text is the verbatim sentence of the answer that satisfied it, and
// every anchor comes from `indexOf`, exactly as `resolveMarkingPointAnchors`
// computes it in route.ts. `scripts/validate-showcase.py` re-derives and
// re-checks all of it; run it before committing a change to the JSON.

import showcase from "@/lib/data/act2-showcase.json";
import type { MarkingPoint } from "@/lib/history";

export interface ShowcaseEvaluation {
  subject: string;
  board: string;
  year: number;
  question_number: string;
  question_text: string;
  student_answer_text: string;
  total_marks: number;
  marks_awarded: number;
  is_objective: boolean;
  marking_points: MarkingPoint[];
  conceptual_errors: string[];
  icse_style_issues: string[];
  unassessable_components: string[];
  model_answer: string;
  model_answer_source: "verified" | "ai_generated";
  examiner_feedback: string;
  improvement_tips: string[];
}

// The JSON's `status` and `model_answer_source` widen to `string` on import,
// so the assertion is narrowing a known-good literal set, not papering over an
// unverified shape — the validator is what actually checks those values.
export const SHOWCASE_EVAL = showcase as ShowcaseEvaluation;

export interface ShowcaseRecord {
  subject: string;
  board: string;
  year: number;
  questionNumber: string;
  questionText: string;
  studentAnswerText: string;
  totalMarks: number;
  marksAwarded: number;
}

export const SHOWCASE: ShowcaseRecord = {
  subject: SHOWCASE_EVAL.subject,
  board: SHOWCASE_EVAL.board,
  year: SHOWCASE_EVAL.year,
  questionNumber: SHOWCASE_EVAL.question_number,
  questionText: SHOWCASE_EVAL.question_text,
  studentAnswerText: SHOWCASE_EVAL.student_answer_text,
  totalMarks: SHOWCASE_EVAL.total_marks,
  marksAwarded: SHOWCASE_EVAL.marks_awarded,
};

/**
 * The answer split into the sentences Act 1 reveals one at a time.
 *
 * Split at the sentence boundary rather than stored as an array so the prose
 * stays the single source of truth — and so the string Act 2 anchors into is
 * byte-identical to the one Act 1 displays. Authoring two copies is how
 * `matched_text` and the rendered answer drift apart.
 */
export function showcaseSentences(): string[] {
  return SHOWCASE.studentAnswerText
    .split(/(?<=\.)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
