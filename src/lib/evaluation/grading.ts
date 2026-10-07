// src/lib/evaluation/grading.ts
//
// The grading pieces shared by the typed-answer route (src/app/api/evaluate),
// the handwritten-answer routes (src/app/api/evaluate/handwritten) and the
// practice-paper marker (src/lib/practice-sets/mark.ts). Moved
// here verbatim from the typed route so both paths build the same prompt,
// validate the same schema, reserve credits the same way and persist the same
// rows. A route file can only export HTTP handlers, so shared code can't live
// there.
//
// Server-only.

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { WEEKLY_CREDIT_LIMIT } from "@/lib/constants";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MarkingScheme {
  scheme_text: string;
  total_marks: number;
  key_points: string[] | Record<string, unknown>;
  model_answer: string | null;
  model_answer_verified: boolean;
  accepted_alternatives: string[] | Record<string, unknown> | null;
  common_errors: string[] | Record<string, unknown> | null;
  examiner_notes: string | null;
  marks_per_correct_point: number | null;
}

// One entry per scheme-defined marking point. matched_text is a verbatim
// quote Claude copies from the student's answer — never a character index;
// asking a model to count characters reliably produces off-by-several
// errors (proven out by hand while building the landing page demo). The
// anchor is computed deterministically in code via resolveMarkingPointAnchors.
export interface MarkingPoint {
  point: string;
  marks: number;
  status: "awarded" | "partial" | "missed";
  marks_awarded: number;
  matched_text: string | null;
  anchor: { start: number; end: number } | null;
}

export interface EvaluationOutput {
  marks_awarded: number;
  total_marks: number;
  marking_points: MarkingPoint[];
  conceptual_errors: string[];
  icse_style_issues: string[];
  unassessable_components: string[];
  model_answer: string;
  model_answer_source: "verified" | "ai_generated";
  examiner_feedback: string;
  improvement_tips: string[];
  is_objective?: boolean;
  correct_answer?: string;
  is_correct?: boolean;
  token_cost: number;
  tokens_remaining: number;
}

// Two import batches shaped MCQ options differently: chemistry/physics/
// biology/geography store plain option strings (correct_answer is the full
// matching string); history & civics / english literature store {key, text}
// objects (correct_answer is just the key letter, e.g. "d"). Both shapes
// have to be supported here.
export type McqOption = string | { key: string; text: string };

// ─── Objective Answer Matching ────────────────────────────────────────────────

function normaliseAnswer(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[a-d]\.\s*/i, "")
    .replace(/\s+/g, " ");
}

function matchesSingleAnswer(
  userAnswer: string,
  correctAnswer: string,
  questionType: string | null
): boolean {
  const userNorm = normaliseAnswer(userAnswer);
  const correctNorm = normaliseAnswer(correctAnswer);

  if (questionType === "mcq") {
    const userLetter = userAnswer.trim().toUpperCase().charAt(0);
    const correctLetter = correctAnswer.trim().toUpperCase().charAt(0);
    return (
      userNorm === correctNorm ||
      (userLetter === correctLetter && /^[A-D]$/.test(userLetter))
    );
  }

  if (questionType === "match") {
    const parsePairs = (s: string) =>
      s
        .toLowerCase()
        .replace(/\s/g, "")
        .split(",")
        .map((p) => p.trim())
        .sort();
    return parsePairs(userAnswer).join() === parsePairs(correctAnswer).join();
  }

  return userNorm === correctNorm;
}

// correctAnswer is an array only for the handful of multi-accepted-answer
// MCQs (correct_option holds e.g. ["c", "d"]) — the student can still only
// submit one option (single-select UI), so a match against any element
// earns the mark.
export function matchObjectiveAnswer(
  userAnswer: string,
  correctAnswer: string | string[],
  questionType: string | null
): boolean {
  if (Array.isArray(correctAnswer)) {
    return correctAnswer.some((opt) => matchesSingleAnswer(userAnswer, opt, questionType));
  }
  return matchesSingleAnswer(userAnswer, correctAnswer, questionType);
}

// Resolves a raw MCQ answer (a full option string, or a bare key like "d")
// to the human-readable option text for display. Falls through to the raw
// value when options are plain strings, no options are on record, or the
// key doesn't resolve — never blocks showing feedback to the student.
function resolveOptionText(raw: string, options: McqOption[] | null): string {
  if (!options) return raw;
  const match = options.find(
    (opt) => typeof opt !== "string" && opt.key.toLowerCase() === raw.trim().toLowerCase()
  );
  return match && typeof match !== "string" ? match.text : raw;
}

// Array case: a multi-accepted-answer MCQ, displayed the same way the
// import data itself joins alternatives (see correct_answer_text, e.g.
// "adjourn the house for lack of discipline / disqualify the members
// under Anti-defection law").
export function resolveAnswerDisplay(raw: string | string[], options: McqOption[] | null): string {
  if (Array.isArray(raw)) {
    return raw.map((r) => resolveOptionText(r, options)).join(" / ");
  }
  return resolveOptionText(raw, options);
}

// ─── Zod schema for Claude's structured output ────────────────────────────────
// Claude's JSON is untrusted input, same as anything from a client — validate
// shape before it touches the DB or the response. This does NOT replace the
// marks_awarded clamp below; a value can be schema-valid and still out of
// range (e.g. 999), so both checks run.
export const MarkingPointSchema = z.object({
  point: z.string(),
  marks: z.number().positive(),
  status: z.enum(["awarded", "partial", "missed"]),
  marks_awarded: z.number().min(0),
  matched_text: z.string().nullable(),
});

export const ClaudeEvalSchema = z.object({
  marks_awarded: z.number(),
  total_marks: z.number(),
  marking_points: z.array(MarkingPointSchema),
  conceptual_errors: z.array(z.string()),
  icse_style_issues: z.array(z.string()),
  unassessable_components: z.array(z.string()),
  model_answer: z.string(),
  model_answer_source: z.enum(["verified", "ai_generated"]),
  examiner_feedback: z.string(),
  improvement_tips: z.array(z.string()),
});

// ─── Anchor Resolution ─────────────────────────────────────────────────────
// Claude returns a verbatim quote (matched_text), never a character index.
// The anchor is computed here, deterministically, by searching for that
// exact quote inside the student's own answer text. If Claude paraphrased
// instead of quoting exactly, indexOf fails and the point still displays —
// just without a highlighted span. This never blocks the evaluation.
export function resolveMarkingPointAnchors(
  markingPoints: z.infer<typeof MarkingPointSchema>[],
  studentAnswer: string
): MarkingPoint[] {
  return markingPoints.map((mp) => {
    if (!mp.matched_text) {
      return { ...mp, anchor: null };
    }
    const start = studentAnswer.indexOf(mp.matched_text);
    if (start === -1) {
      console.warn("[BoardEdge] matched_text not found verbatim in student answer:", {
        point: mp.point,
        matched_text: mp.matched_text,
      });
      return { ...mp, anchor: null };
    }
    return { ...mp, anchor: { start, end: start + mp.matched_text.length } };
  });
}

// ─── User Message ─────────────────────────────────────────────────────────────

export function buildUserMessage(
  questionText: string,
  studentAnswer: string,
  scheme: MarkingScheme
): string {
  return `QUESTION:
${questionText}

<student_answer>
${studentAnswer}
</student_answer>

MARKING SCHEME:
Total Marks: ${scheme.total_marks}

Scheme Text:
${scheme.scheme_text}

Key Points:
${JSON.stringify(scheme.key_points, null, 2)}

${scheme.model_answer ? `Official Model Answer:\n${scheme.model_answer}` : "Model Answer: Not provided — generate from scheme."}

${scheme.accepted_alternatives ? `Accepted Alternatives:\n${JSON.stringify(scheme.accepted_alternatives, null, 2)}` : ""}

${scheme.common_errors ? `Common Pupil Errors (from CISCE Examiner Comments):\n${JSON.stringify(scheme.common_errors, null, 2)}` : ""}

${scheme.examiner_notes ? `Examiner Notes:\n${scheme.examiner_notes}` : ""}

Evaluate the student's answer against the marking scheme above. Return valid JSON only.`;
}

// ─── Token Accounting (atomic) ─────────────────────────────────────────────────
// Replaces the old "SELECT count, check, then UPDATE" pattern. The RPC does
// the check-and-increment as one database operation, so two simultaneous
// requests can't both slip through before either one lands. Called BEFORE
// the Claude API request — reserve the spend first, don't spend then check.
export async function reserveTokens(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  date: string,
  cost: number
): Promise<{ ok: true; newCount: number } | { ok: false }> {
  const { data, error } = await supabase.rpc("increment_usage", {
    p_user_id: userId,
    p_date: date,
    p_cost: cost,
    p_limit: WEEKLY_CREDIT_LIMIT,
  });

  if (error) {
    // TOKEN_LIMIT_EXCEEDED surfaces here as a Postgres exception.
    return { ok: false };
  }
  return { ok: true, newCount: data as number };
}

// Rollback: only called if token reservation succeeded but the Claude call
// then failed — the student shouldn't lose a token for an evaluation they
// never received. Not atomic against a concurrent request, but the failure
// window here is rare (an API error), not the common path, so it's an
// acceptable non-atomic decrement.
export async function refundTokens(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  date: string,
  cost: number
) {
  const { data: existing } = await supabase
    .from("usage")
    .select("token_count")
    .eq("user_id", userId)
    .eq("usage_date", date)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("usage")
      .update({ token_count: Math.max(0, existing.token_count - cost) })
      .eq("user_id", userId)
      .eq("usage_date", date);
  }
}

// ─── Background Persistence ───────────────────────────────────────────────────

export async function persistSubmission(
  supabase: ReturnType<typeof createAdminClient>,
  {
    questionId,
    studentAnswer,
    userId,
    evaluation,
  }: {
    questionId: string;
    studentAnswer: string;
    userId: string;
    evaluation: EvaluationOutput;
  }
): Promise<{ studentAnswerId: string }> {
  const { data: answerRow, error: answerError } = await supabase
    .from("student_answers")
    .insert({
      question_id: questionId,
      answer_text: studentAnswer,
      user_id: userId,
    })
    .select("id")
    .single();

  if (answerError || !answerRow) {
    console.error("[BoardEdge] student_answers insert failed:", answerError);
    throw new Error(`student_answers insert failed: ${answerError?.message}`);
  }

  const evaluationRow = {
    student_answer_id: answerRow.id,
    marks_awarded: evaluation.marks_awarded,
    marking_points: evaluation.marking_points,
    conceptual_errors: evaluation.conceptual_errors,
    model_answer: evaluation.model_answer,
    model_answer_source: evaluation.model_answer_source,
    examiner_feedback: evaluation.examiner_feedback,
    improvement_tips: evaluation.improvement_tips,
  };

  let { error: evalError } = await supabase.from("evaluations").insert(evaluationRow);

  // FIX: marks_awarded was an integer column while total_marks is numeric, so a
  // half mark — which the examiner prompt now allows wherever the scheme itself
  // splits a point into value and unit — was rejected outright. The student saw
  // "could not be saved" on an answer that had just been graded correctly.
  // 20260915180000_widen_marks_awarded_to_numeric.sql widens the column; until
  // that migration is applied this retries with a rounded mark so a graded
  // answer is never thrown away. The exact fractional value survives either way
  // inside marking_points[].marks_awarded, which is jsonb, so nothing is lost
  // even when the summary column has to be rounded.
  if (evalError && !Number.isInteger(evaluation.marks_awarded)) {
    const rounded = Math.round(evaluation.marks_awarded);
    console.warn(
      "[BoardEdge] evaluations insert rejected a fractional mark; retrying rounded.",
      { from: evaluation.marks_awarded, to: rounded, reason: evalError.message }
    );
    ({ error: evalError } = await supabase
      .from("evaluations")
      .insert({ ...evaluationRow, marks_awarded: rounded }));
  }

  if (evalError) {
    console.error("[BoardEdge] evaluations insert failed:", evalError);
    throw new Error(`evaluations insert failed: ${evalError.message}`);
  }
  return { studentAnswerId: answerRow.id as string };
}
