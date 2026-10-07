// src/lib/practice-sets/mark.ts
//
// Marks a submitted practice paper. Each answer is graded exactly as a single
// question is in /api/evaluate: objective answers by deterministic matching,
// written answers by one Claude call with the same examiner prompt, user
// message, schema validation and marks clamp. Each result is persisted with
// persistSubmission, so paper answers show up in /history, count towards
// mastery and feed the reattempt prompts like any other answer.
//
// Credits are NOT reserved here. submitPaper() reserves the whole paper's cost
// once, atomically, when the student hands it in; this file only refunds the
// cost of an answer it fails to mark. That keeps a resumed or repeated marker
// run from ever charging twice.
//
// Resumable and safe to run concurrently: an answer is claimed (pending ->
// grading) by a conditional update before it is graded, so two runs never mark
// the same answer, and a claim older than STALE_CLAIM_MS (a run that died) is
// taken over. A run stops claiming new answers at its deadline and reports
// progress; the client simply calls again until the paper is done.
//
// Server-only.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { CREDIT_COST_OBJECTIVE, CREDIT_COST_SUBJECTIVE } from "@/lib/constants";
import {
  buildUserMessage,
  ClaudeEvalSchema,
  matchObjectiveAnswer,
  persistSubmission,
  refundTokens,
  resolveAnswerDisplay,
  resolveMarkingPointAnchors,
  type EvaluationOutput,
  type MarkingScheme,
  type McqOption,
} from "@/lib/evaluation/grading";
import { buildExaminerSystemPrompt } from "@/lib/prompts/examiner-prompt";
import { isSubjectiveGraded } from "@/lib/question-format";

type Admin = ReturnType<typeof createAdminClient>;

const STALE_CLAIM_MS = 3 * 60 * 1000;
const CONCURRENCY = 4;

export interface MarkProgress {
  status: "in_progress" | "marking" | "marked";
  /** Answers dealt with (marked, failed or blank) out of the paper's questions. */
  done: number;
  total: number;
  /** Set only by the run that closed the paper, so it is reported once. */
  finished?: { score: number; outOf: number };
  /** Answers this run marked, for telemetry. */
  graded?: GradedAnswer[];
}

export interface GradedAnswer {
  questionId: string;
  questionType: string | null;
  isSubjective: boolean;
  marksAwarded: number;
  totalMarks: number;
}

interface QuestionForMarking {
  id: string;
  question_text: string;
  is_subjective: boolean;
  question_type: string | null;
  options: McqOption[] | null;
  correct_answer: string | null;
  correct_option: string | string[] | null;
  marking_schemes: MarkingScheme | MarkingScheme[] | null;
}

/** The IST calendar day credits were reserved on, so a refund lands on the same day's row. */
export function usageDateOf(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function creditCost(q: { is_subjective: boolean; question_type: string | null }): number {
  return isSubjectiveGraded(q) ? CREDIT_COST_SUBJECTIVE : CREDIT_COST_OBJECTIVE;
}

// ─── Grading one answer ───────────────────────────────────────────────────────

function gradeObjective(q: QuestionForMarking, scheme: MarkingScheme, answer: string): EvaluationOutput {
  const source = q.correct_option ?? q.correct_answer;
  if (!source) throw new Error("answer key missing");
  const isCorrect = matchObjectiveAnswer(answer, source, q.question_type);
  const marksAwarded = isCorrect ? scheme.total_marks : 0;
  const display = resolveAnswerDisplay(source, q.options);
  // Same shape the typed route persists for an objective question.
  return {
    marks_awarded: marksAwarded,
    total_marks: scheme.total_marks,
    marking_points: [
      {
        point: display,
        marks: scheme.total_marks,
        status: isCorrect ? "awarded" : "missed",
        marks_awarded: marksAwarded,
        matched_text: isCorrect ? answer : null,
        anchor: isCorrect ? { start: 0, end: answer.length } : null,
      },
    ],
    conceptual_errors: [],
    icse_style_issues: [],
    unassessable_components: [],
    model_answer: display,
    model_answer_source: "verified",
    examiner_feedback: isCorrect ? "Correct." : `Incorrect. The correct answer is: ${display}`,
    improvement_tips: isCorrect ? [] : [`Revisit this exact question — the correct answer was "${display}".`],
    is_objective: true,
    correct_answer: display,
    is_correct: isCorrect,
    token_cost: CREDIT_COST_OBJECTIVE,
    tokens_remaining: 0,
  };
}

async function gradeWritten(
  anthropic: Anthropic,
  subject: string,
  q: QuestionForMarking,
  scheme: MarkingScheme,
  answer: string,
): Promise<EvaluationOutput> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    system: buildExaminerSystemPrompt(subject),
    messages: [{ role: "user", content: buildUserMessage(q.question_text, answer, scheme) }],
  });
  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("Claude returned no text content");
  const cleaned = textBlock.text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const validated = ClaudeEvalSchema.safeParse(JSON.parse(cleaned));
  if (!validated.success) throw new Error(`Schema validation failed: ${validated.error.message}`);
  const claudeEval: z.infer<typeof ClaudeEvalSchema> = validated.data;

  // Schema validation checks shape, not range: the clamp is load-bearing.
  const clamped = Math.max(0, Math.min(claudeEval.marks_awarded, scheme.total_marks));
  if (clamped !== claudeEval.marks_awarded) {
    console.warn("[BoardEdge] marks_awarded out of range, clamped:", {
      questionId: q.id,
      original: claudeEval.marks_awarded,
      total_marks: scheme.total_marks,
    });
  }
  claudeEval.model_answer_source = scheme.model_answer_verified ? "verified" : "ai_generated";
  return {
    ...claudeEval,
    marking_points: resolveMarkingPointAnchors(claudeEval.marking_points, answer),
    marks_awarded: clamped,
    token_cost: CREDIT_COST_SUBJECTIVE,
    tokens_remaining: 0,
  };
}

async function grade(
  anthropic: Anthropic,
  subject: string,
  q: QuestionForMarking,
  answer: string,
): Promise<EvaluationOutput> {
  const scheme = Array.isArray(q.marking_schemes) ? q.marking_schemes[0] : q.marking_schemes;
  if (!scheme) throw new Error("marking scheme missing");
  if (!isSubjectiveGraded(q)) return gradeObjective(q, scheme, answer);
  // One retry: a truncated or malformed reply is usually a one-off.
  try {
    return await gradeWritten(anthropic, subject, q, scheme, answer);
  } catch (err) {
    console.warn("[BoardEdge] paper answer grading failed, retrying once:", err instanceof Error ? err.message : err);
    return gradeWritten(anthropic, subject, q, scheme, answer);
  }
}

// ─── The marker ──────────────────────────────────────────────────────────────

async function progressOf(admin: Admin, setId: string, total: number): Promise<number> {
  const { count } = await admin
    .from("practice_set_answers")
    .select("question_id", { count: "exact", head: true })
    .eq("set_id", setId)
    .in("mark_state", ["marked", "failed", "skipped"]);
  return Math.min(total, count ?? 0);
}

/**
 * Marks whatever is still unmarked on a submitted paper, until `deadline`
 * (epoch ms). Finalises the paper (status "marked", score) once nothing is
 * left. `userId` must be the verified session user: the paper is re-read and
 * checked against it here, not trusted from the caller.
 */
export async function markPaper(userId: string, setId: string, deadline: number): Promise<MarkProgress | null> {
  const admin = createAdminClient();
  const { data: set, error } = await admin
    .from("practice_sets")
    .select("id, user_id, subject, status, question_ids, total_marks, submitted_at")
    .eq("id", setId)
    .maybeSingle();
  if (error || !set || set.user_id !== userId) return null;
  const total = (set.question_ids as string[]).length;
  if (set.status !== "marking") {
    return { status: set.status, done: set.status === "marked" ? total : 0, total };
  }

  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const { data: open } = await admin
    .from("practice_set_answers")
    .select("question_id, answer_text, mark_state, claimed_at")
    .eq("set_id", setId)
    .or(`mark_state.eq.pending,and(mark_state.eq.grading,claimed_at.lt.${staleBefore})`);
  const queue = (open ?? []) as { question_id: string; answer_text: string; mark_state: string; claimed_at: string | null }[];
  const graded: GradedAnswer[] = [];

  if (queue.length) {
    const { data: qs, error: qError } = await admin
      .from("questions")
      .select(
        "id, question_text, is_subjective, question_type, options, correct_answer, correct_option, " +
          "marking_schemes ( scheme_text, total_marks, key_points, model_answer, model_answer_verified, " +
          "accepted_alternatives, common_errors, examiner_notes, marks_per_correct_point )",
      )
      .in(
        "id",
        queue.map((a) => a.question_id),
      );
    if (qError) {
      console.error("[BoardEdge] paper marking question read failed:", qError.message);
      return { status: "marking", done: await progressOf(admin, setId, total), total };
    }
    const questions = new Map(((qs ?? []) as unknown as QuestionForMarking[]).map((q) => [q.id, q]));
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const refundDate = usageDateOf((set.submitted_at as string | null) ?? new Date().toISOString());

    let next = 0;
    const worker = async () => {
      while (next < queue.length && Date.now() < deadline) {
        const item = queue[next++];
        // Claim it. Only the run whose update matches the state it read gets
        // to grade; anyone else sees zero rows and moves on.
        let claim = admin
          .from("practice_set_answers")
          .update({ mark_state: "grading", claimed_at: new Date().toISOString() })
          .eq("set_id", setId)
          .eq("question_id", item.question_id)
          .eq("mark_state", item.mark_state);
        if (item.mark_state === "grading") claim = claim.lt("claimed_at", staleBefore);
        const { data: claimed } = await claim.select("question_id");
        if (!claimed?.length) continue;

        const q = questions.get(item.question_id);
        const cost = q ? creditCost(q) : 0;
        try {
          if (!q) throw new Error("question missing");
          const evaluation = await grade(anthropic, set.subject as string, q, item.answer_text);
          const { studentAnswerId } = await persistSubmission(admin, {
            questionId: q.id,
            studentAnswer: item.answer_text,
            userId,
            evaluation,
          });
          await admin
            .from("practice_set_answers")
            .update({ mark_state: "marked", student_answer_id: studentAnswerId, updated_at: new Date().toISOString() })
            .eq("set_id", setId)
            .eq("question_id", item.question_id);
          graded.push({
            questionId: q.id,
            questionType: q.question_type,
            isSubjective: isSubjectiveGraded(q),
            marksAwarded: evaluation.marks_awarded,
            totalMarks: evaluation.total_marks,
          });
        } catch (err) {
          console.error("[BoardEdge] paper answer could not be marked:", {
            setId,
            questionId: item.question_id,
            error: err instanceof Error ? err.message : String(err),
          });
          await admin
            .from("practice_set_answers")
            .update({ mark_state: "failed", updated_at: new Date().toISOString() })
            .eq("set_id", setId)
            .eq("question_id", item.question_id);
          // The paper's credits were reserved at submission; this answer got
          // no mark, so its share goes back.
          if (cost > 0) await refundTokens(admin, userId, refundDate, cost);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  }

  const { data: remaining } = await admin
    .from("practice_set_answers")
    .select("question_id")
    .eq("set_id", setId)
    .in("mark_state", ["pending", "grading"])
    .limit(1);
  if (remaining?.length) {
    return { status: "marking", done: await progressOf(admin, setId, total), total, graded };
  }

  const finished = await finalisePaper(admin, setId);
  return { status: "marked", done: total, total, graded, ...(finished ? { finished } : {}) };
}

/** Totals the marked answers and closes the paper. Idempotent: only the run that closes it gets the totals back. */
async function finalisePaper(admin: Admin, setId: string): Promise<{ score: number; outOf: number } | null> {
  const [{ data: set }, { data: rows }] = await Promise.all([
    admin.from("practice_sets").select("question_ids").eq("id", setId).single(),
    admin
      .from("practice_set_answers")
      .select("question_id, mark_state, student_answer_id, evaluation:student_answers ( evaluations ( marks_awarded ) )")
      .eq("set_id", setId),
  ]);
  const ids = (set?.question_ids as string[] | undefined) ?? [];
  const { data: marks } = await admin.from("question_marks").select("question_id, total_marks").in("question_id", ids);
  const marksOf = new Map(
    ((marks ?? []) as { question_id: string; total_marks: number | string | null }[]).map((m) => [
      m.question_id,
      Number(m.total_marks ?? 0),
    ]),
  );

  let score = 0;
  let outOf = 0;
  for (const id of ids) outOf += marksOf.get(id) ?? 0;
  for (const r of (rows ?? []) as unknown as {
    question_id: string;
    mark_state: string;
    evaluation: { evaluations: { marks_awarded: number | string | null }[] | null } | null;
  }[]) {
    // An answer we couldn't mark is left out of the total, not counted as zero.
    if (r.mark_state === "failed") outOf -= marksOf.get(r.question_id) ?? 0;
    if (r.mark_state === "marked") score += Number(r.evaluation?.evaluations?.[0]?.marks_awarded ?? 0);
  }

  const { data: closed } = await admin
    .from("practice_sets")
    .update({ status: "marked", marked_at: new Date().toISOString(), score, marked_total: Math.max(0, outOf) })
    .eq("id", setId)
    .eq("status", "marking")
    .select("id");
  return closed?.length ? { score, outOf: Math.max(0, outOf) } : null;
}
