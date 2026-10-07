// src/lib/practice-sets/read.ts
//
// Reading a student's practice papers: the paper itself, their draft answers
// while it's open, and the marked results once it has been submitted. The
// paper row and the answers are read through the session client, so RLS
// (practice_sets_select_own, practice_set_answers_select_own) decides whose
// papers are visible; a paper id that isn't yours reads as "not found".
// Question text and results are read with the service-role client, keyed on
// ids that came out of an RLS-checked read.
//
// Answer keys never reach the browser before a paper is marked: questions are
// read with the same QUESTION_SELECT as /evaluate (no answers in it), and
// results are only attached once the paper's status is "marked".
//
// Server-only.

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { QUESTION_SELECT, type Question } from "@/app/(protected)/evaluate/_lib/question";
import type { MarkingPoint } from "@/lib/evaluation/grading";
import { classify } from "./build";
import type { PaperStatus, SetSpec, SetType } from "./constants";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPaperId(id: string): boolean {
  return UUID.test(id);
}

// ─── Recent papers ───────────────────────────────────────────────────────────

export interface SetSummary {
  id: string;
  subject: string;
  status: PaperStatus;
  questionCount: number;
  answeredCount: number;
  totalMarks: number;
  score: number | null;
  markedTotal: number | null;
  createdAt: string;
  submittedAt: string | null;
}

export async function listRecentSets(userId: string, limit = 6): Promise<SetSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("practice_sets")
    .select(
      "id, subject, status, question_ids, total_marks, score, marked_total, created_at, submitted_at, " +
        "practice_set_answers ( question_id, answer_text )",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[BoardEdge] practice set list failed:", error.message);
    return [];
  }
  return ((data ?? []) as unknown as {
    id: string;
    subject: string;
    status: PaperStatus;
    question_ids: string[];
    total_marks: number | string;
    score: number | string | null;
    marked_total: number | string | null;
    created_at: string;
    submitted_at: string | null;
    practice_set_answers: { question_id: string; answer_text: string }[] | null;
  }[]).map((r) => ({
    id: r.id,
    subject: r.subject,
    status: r.status,
    questionCount: r.question_ids.length,
    answeredCount: (r.practice_set_answers ?? []).filter((a) => a.answer_text.trim()).length,
    totalMarks: Number(r.total_marks),
    score: r.score === null ? null : Number(r.score),
    markedTotal: r.marked_total === null ? null : Number(r.marked_total),
    createdAt: r.created_at,
    submittedAt: r.submitted_at,
  }));
}

// ─── One paper ───────────────────────────────────────────────────────────────

export type MarkState = "draft" | "pending" | "grading" | "marked" | "failed" | "skipped";

export interface PaperQuestion {
  id: string;
  /** Position in this paper, from 1. */
  number: number;
  type: SetType | null;
  marks: number;
  chapter: string | null;
  /** Display fields, exactly as /evaluate reads them. No answer key. */
  question: Question;
}

export interface PaperAnswer {
  text: string;
  flagged: boolean;
  markState: MarkState;
  updatedAt: string;
}

export interface QuestionResult {
  awarded: number;
  markingPoints: MarkingPoint[];
  conceptualErrors: string[];
  modelAnswer: string | null;
  modelAnswerSource: "verified" | "ai_generated" | null;
  examinerFeedback: string | null;
  improvementTips: string[];
}

export interface Paper {
  id: string;
  subject: string;
  spec: SetSpec;
  status: PaperStatus;
  totalMarks: number;
  createdAt: string;
  startedAt: string | null;
  submittedAt: string | null;
  markedAt: string | null;
  score: number | null;
  markedTotal: number | null;
  questions: PaperQuestion[];
  answers: Record<string, PaperAnswer>;
  /** Only present once the paper is marked. */
  results: Record<string, QuestionResult>;
}

interface EvaluationRow {
  marks_awarded: number | string | null;
  marking_points: MarkingPoint[] | null;
  conceptual_errors: string[] | null;
  model_answer: string | null;
  model_answer_source: "verified" | "ai_generated" | null;
  examiner_feedback: string | null;
  improvement_tips: string[] | null;
}

export async function readPaper(userId: string, setId: string): Promise<Paper | null> {
  if (!isPaperId(setId)) return null;
  const supabase = await createClient();
  const [{ data: set, error }, { data: answerRows, error: answersError }] = await Promise.all([
    supabase
      .from("practice_sets")
      .select(
        "id, user_id, subject, spec, status, question_ids, total_marks, created_at, started_at, submitted_at, " +
          "marked_at, score, marked_total",
      )
      .eq("id", setId)
      .maybeSingle(),
    supabase
      .from("practice_set_answers")
      .select("question_id, answer_text, flagged, mark_state, updated_at, student_answer_id")
      .eq("set_id", setId),
  ]);
  if (error || !set) {
    if (error) console.warn("[BoardEdge] practice set read failed:", error.message);
    return null;
  }
  if (answersError) console.warn("[BoardEdge] practice set answers read failed:", answersError.message);
  const row = set as unknown as {
    id: string;
    user_id: string;
    subject: string;
    spec: SetSpec;
    status: PaperStatus;
    question_ids: string[];
    total_marks: number | string;
    created_at: string;
    started_at: string | null;
    submitted_at: string | null;
    marked_at: string | null;
    score: number | string | null;
    marked_total: number | string | null;
  };
  if (row.user_id !== userId) return null;

  const admin = createAdminClient();
  const { data: qs, error: qError } = await admin.from("questions").select(QUESTION_SELECT).in("id", row.question_ids);
  if (qError) {
    console.error("[BoardEdge] practice set questions read failed:", qError.message);
    return null;
  }

  const answers: Record<string, PaperAnswer> = {};
  const answerIds = new Map<string, string>();
  for (const a of (answerRows ?? []) as {
    question_id: string;
    answer_text: string;
    flagged: boolean;
    mark_state: MarkState;
    updated_at: string;
    student_answer_id: string | null;
  }[]) {
    answers[a.question_id] = {
      text: a.answer_text,
      flagged: a.flagged,
      markState: a.mark_state,
      updatedAt: a.updated_at,
    };
    if (a.student_answer_id) answerIds.set(a.question_id, a.student_answer_id);
  }

  const results: Record<string, QuestionResult> = {};
  if (row.status === "marked" && answerIds.size) {
    const { data: evals, error: evalError } = await admin
      .from("evaluations")
      .select(
        "student_answer_id, marks_awarded, marking_points, conceptual_errors, model_answer, model_answer_source, " +
          "examiner_feedback, improvement_tips",
      )
      .in("student_answer_id", [...answerIds.values()]);
    if (evalError) console.error("[BoardEdge] practice set results read failed:", evalError.message);
    const byAnswer = new Map(
      ((evals ?? []) as unknown as (EvaluationRow & { student_answer_id: string })[]).map((e) => [e.student_answer_id, e]),
    );
    for (const [questionId, answerId] of answerIds) {
      const e = byAnswer.get(answerId);
      if (!e) continue;
      results[questionId] = {
        awarded: Number(e.marks_awarded ?? 0),
        markingPoints: Array.isArray(e.marking_points) ? e.marking_points : [],
        conceptualErrors: e.conceptual_errors ?? [],
        modelAnswer: e.model_answer,
        modelAnswerSource: e.model_answer_source,
        examinerFeedback: e.examiner_feedback,
        improvementTips: e.improvement_tips ?? [],
      };
    }
  }

  const byId = new Map(((qs ?? []) as unknown as Question[]).map((q) => [q.id, q]));
  const questions: PaperQuestion[] = [];
  for (const id of row.question_ids) {
    const q = byId.get(id);
    if (!q) continue; // a question removed since the paper was built
    const qm = Array.isArray(q.question_marks) ? q.question_marks[0] : q.question_marks;
    questions.push({
      id,
      number: questions.length + 1,
      type: classify(q),
      marks: Number(qm?.total_marks ?? 0),
      chapter: q.chapter?.trim() || null,
      question: q,
    });
  }

  return {
    id: row.id,
    subject: row.subject,
    spec: row.spec,
    status: row.status,
    totalMarks: Number(row.total_marks),
    createdAt: row.created_at,
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
    markedAt: row.marked_at,
    score: row.score === null ? null : Number(row.score),
    markedTotal: row.marked_total === null ? null : Number(row.marked_total),
    questions,
    answers,
    results,
  };
}
