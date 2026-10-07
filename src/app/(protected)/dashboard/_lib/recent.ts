// src/app/(protected)/dashboard/_lib/recent.ts
//
// What the dashboard needs to know about a student's recent practice: their
// practice papers (read through listRecentSets, so RLS decides visibility) and
// their recent single-question attempts from /evaluate.
//
// Marking a practice paper writes each answer through persistSubmission, so
// paper answers are student_answers rows too. Those are left out of the
// question list here — the paper itself already stands for them, and listing
// fifteen "Q3 · Chemistry" rows under one paper would bury everything else.
//
// Server-only.

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { listRecentSets, type SetSummary } from "@/lib/practice-sets/read";

export interface QuestionAttempt {
  /** student_answers.id — the key /history/[id] reads. */
  id: string;
  submittedAt: string;
  subject: string;
  questionNumber: string | null;
  year: number | null;
  awarded: number | null;
  totalMarks: number;
}

interface AttemptRow {
  id: string;
  submitted_at: string;
  questions: {
    question_number: string | null;
    year: number | null;
    subjects: { name: string } | null;
    marking_schemes: { total_marks: number | string }[] | null;
  } | null;
  evaluations: { marks_awarded: number | string | null }[] | null;
}

async function listRecentQuestionAttempts(userId: string, limit: number): Promise<QuestionAttempt[]> {
  // Admin client scoped on user_id, the same read /history makes. Over-fetch so
  // that dropping the paper answers still leaves enough to fill the list.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("student_answers")
    .select(
      `
      id, submitted_at,
      questions (
        question_number, year,
        subjects ( name ),
        marking_schemes ( total_marks )
      ),
      evaluations ( marks_awarded )
    `,
    )
    .eq("user_id", userId)
    .order("submitted_at", { ascending: false })
    .limit(limit * 4);
  if (error) {
    console.warn("[BoardEdge] dashboard recent attempts failed:", error.message);
    return [];
  }
  const rows = (data ?? []) as unknown as AttemptRow[];
  if (!rows.length) return [];

  const supabase = await createClient();
  const { data: paperRows, error: paperError } = await supabase
    .from("practice_set_answers")
    .select("student_answer_id")
    .in(
      "student_answer_id",
      rows.map((r) => r.id),
    );
  if (paperError) console.warn("[BoardEdge] dashboard paper-answer lookup failed:", paperError.message);
  const fromPapers = new Set(
    ((paperRows ?? []) as { student_answer_id: string | null }[]).map((r) => r.student_answer_id),
  );

  return rows
    .filter((r) => !fromPapers.has(r.id))
    .slice(0, limit)
    .map((r) => {
      const q = r.questions;
      const awarded = r.evaluations?.[0]?.marks_awarded;
      return {
        id: r.id,
        submittedAt: r.submitted_at,
        subject: q?.subjects?.name ?? "Unknown subject",
        questionNumber: q?.question_number ?? null,
        year: q?.year ?? null,
        // numeric columns can come back from PostgREST as strings.
        awarded: awarded === null || awarded === undefined ? null : Number(awarded),
        totalMarks: Number(q?.marking_schemes?.[0]?.total_marks ?? 0),
      };
    });
}

export type RecentItem =
  | { kind: "paper"; at: string; paper: SetSummary }
  | { kind: "question"; at: string; attempt: QuestionAttempt };

export interface DashboardPractice {
  /** The paper to carry on with: newest open one, else newest still marking. */
  openPaper: SetSummary | null;
  /** Newest marked paper. */
  latestMarked: SetSummary | null;
  /** Papers and single questions, newest first. */
  recent: RecentItem[];
}

const RECENT_LIMIT = 6;

export async function readDashboardPractice(userId: string): Promise<DashboardPractice> {
  const [sets, attempts] = await Promise.all([
    listRecentSets(userId, 10),
    listRecentQuestionAttempts(userId, RECENT_LIMIT),
  ]);

  const openPaper =
    sets.find((s) => s.status === "in_progress") ?? sets.find((s) => s.status === "marking") ?? null;
  const latestMarked = sets.find((s) => s.status === "marked" && s.score !== null) ?? null;

  const recent: RecentItem[] = [
    ...sets.map((paper) => ({ kind: "paper" as const, at: paper.submittedAt ?? paper.createdAt, paper })),
    ...attempts.map((attempt) => ({ kind: "question" as const, at: attempt.submittedAt, attempt })),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, RECENT_LIMIT);

  return { openPaper, latestMarked, recent };
}
