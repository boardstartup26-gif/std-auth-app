// src/lib/evaluation/grading.ts
//
// The grading pieces shared by the typed-answer route (src/app/api/evaluate)
// and the handwritten-answer routes (src/app/api/evaluate/handwritten). Moved
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

${scheme.model_answer ? `Reference Model Answer:\n${scheme.model_answer}` : "Model Answer: Not provided — generate from scheme."}

${scheme.accepted_alternatives ? `Accepted Alternatives:\n${JSON.stringify(scheme.accepted_alternatives, null, 2)}` : ""}

${scheme.common_errors ? `Common Pupil Errors:\n${JSON.stringify(scheme.common_errors, null, 2)}` : ""}

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
): Promise<void> {
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
}
