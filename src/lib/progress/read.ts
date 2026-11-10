// src/lib/progress/read.ts
//
// The one database read behind every progress figure. Server-only: it uses
// the service-role client, so it must always be called with a user id that
// came from a verified session (or, in a cron, from the user list the cron
// itself read) — never one taken from a request body.
//
// Why the admin client: it is the same read /history makes. Every query here
// is filtered on user_id, so the RLS bypass only buys the joined
// marking_schemes total, which RLS hides from students until a question is
// attempted (and every row here *is* an attempt).

import { createAdminClient } from "@/lib/supabase/server";
import { isSubjectiveGraded } from "@/lib/question-format";
import type { MarkingPoint } from "@/lib/history";
import type { ProgressAttempt } from "./types";

// PostgREST caps a response at 1000 rows. A bare select silently truncates a
// long history and every figure built on it comes out wrong (see the same
// note in analytics/aggregate.ts and notifications/reattempt.ts).
const PAGE_SIZE = 1000;

// `evaluations ( * )` is deliberate, as on /history: the table has columns no
// migration created, and icse_style_issues only exists once
// 20261110120000_evaluation_leakage_facts.sql is applied. Naming columns
// would make this read fail outright in either situation.
interface Row {
  id: string;
  question_id: string;
  submitted_at: string;
  questions: {
    question_number: string | null;
    year: number | null;
    is_subjective: boolean;
    question_type: string | null;
    chapter: string | null;
    subjects: { name: string } | null;
    marking_schemes: { total_marks: number | string }[] | { total_marks: number | string } | null;
  } | null;
  evaluations:
    | {
        marks_awarded: number | string | null;
        marking_points?: MarkingPoint[] | null;
        points_missed?: string[] | null;
        conceptual_errors?: string[] | null;
        icse_style_issues?: string[] | null;
      }[]
    | null;
}

const stringArray = (v: unknown): string[] | null =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null;

/** Pure: one row to one attempt, or null when it can't be scored. */
export function normaliseRow(row: Row): ProgressAttempt | null {
  const q = row.questions;
  const ev = row.evaluations?.[0];
  if (!q || !ev) return null;
  const scheme = Array.isArray(q.marking_schemes) ? q.marking_schemes[0] : q.marking_schemes;
  // numeric columns can come back from PostgREST as strings.
  const total = Number(scheme?.total_marks ?? 0);
  const awarded = Number(ev.marks_awarded ?? NaN);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(awarded)) return null;

  return {
    answerId: row.id,
    questionId: row.question_id,
    submittedAt: row.submitted_at,
    subject: q.subjects?.name ?? "Unknown subject",
    chapter: q.chapter?.trim() || null,
    questionNumber: q.question_number ?? "—",
    year: q.year,
    written: isSubjectiveGraded(q),
    total,
    // Same clamp the grader applies, so a bad historical row can't produce a
    // negative loss or a gain above the question's marks.
    awarded: Math.min(Math.max(awarded, 0), total),
    markingPoints: Array.isArray(ev.marking_points) ? ev.marking_points : null,
    pointsMissed: stringArray(ev.points_missed),
    conceptualErrors: stringArray(ev.conceptual_errors),
    styleIssues: stringArray(ev.icse_style_issues),
  };
}

export type ProgressRead = { ok: true; attempts: ProgressAttempt[] } | { ok: false; attempts: [] };

/**
 * Every graded attempt for one student, oldest first. Callers decide what a
 * failed read means for them; this never throws.
 */
export async function readProgressAttempts(
  userId: string,
  { sinceIso }: { sinceIso?: string } = {},
): Promise<ProgressRead> {
  const admin = createAdminClient();
  const attempts: ProgressAttempt[] = [];
  try {
    for (let from = 0; ; from += PAGE_SIZE) {
      let query = admin
        .from("student_answers")
        .select(
          `id, question_id, submitted_at,
           questions ( question_number, year, is_subjective, question_type, chapter,
                       subjects ( name ), marking_schemes ( total_marks ) ),
           evaluations ( * )`,
        )
        .eq("user_id", userId);
      if (sinceIso) query = query.gte("submitted_at", sinceIso);
      const { data, error } = await query
        .order("submitted_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        console.warn("[BoardEdge] progress read failed:", error.message);
        return { ok: false, attempts: [] };
      }
      for (const row of (data ?? []) as unknown as Row[]) {
        const a = normaliseRow(row);
        if (a) attempts.push(a);
      }
      if (!data || data.length < PAGE_SIZE) return { ok: true, attempts };
    }
  } catch (err) {
    console.error("[BoardEdge] progress read threw:", err);
    return { ok: false, attempts: [] };
  }
}
