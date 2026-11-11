// Server-only reads shared by the four progress views. Every figure on these
// pages is derived from readProgressAttempts() through lib/progress — the same
// derivation the dashboard, the Board Plan and the parent report use — so a
// number here can't disagree with one elsewhere.

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readProgressAttempts, type ProgressRead } from "@/lib/progress/read";
import { computeLeakage } from "@/lib/progress";
import type { ProgressAttempt } from "@/lib/progress/types";
import { SUBJECTS } from "@/app/(protected)/evaluate/_lib/question";

/** The verified user and their graded attempts; redirects to /login without a session. */
export async function loadProgress(next: string): Promise<{ userId: string; read: ProgressRead }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return { userId: user.id, read: await readProgressAttempts(user.id) };
}

export interface SubjectStat {
  subject: string;
  /** Marks scored / available, on the latest attempt at each question. */
  scored: number;
  possible: number;
  percent: number;
  questions: number;
}

/**
 * Per-subject score on the latest attempt at each question — the same basis
 * as the Leakage Map, so "64%" here and "36% lost" there describe the same
 * answers. Only subjects the student has answered; known subjects first in
 * the app's usual order.
 */
export function subjectStats(attempts: ProgressAttempt[]): SubjectStat[] {
  const present = [...new Set(attempts.map((a) => a.subject))];
  const known = SUBJECTS as readonly string[];
  present.sort((a, b) => {
    const ia = known.indexOf(a);
    const ib = known.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
  return present.map((subject) => {
    const l = computeLeakage(attempts.filter((a) => a.subject === subject));
    const scored = l.possible - l.lost;
    return {
      subject,
      scored,
      possible: l.possible,
      percent: l.possible ? Math.round((scored / l.possible) * 100) : 0,
      questions: l.questions,
    };
  });
}

/**
 * Marked practice papers, counted through the session client so RLS scopes
 * it. null on a failed read: the caller hides the figure rather than show 0.
 */
export const countMarkedPapers = cache(async (userId: string): Promise<number | null> => {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("practice_sets")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "marked");
  if (error) {
    console.warn("[BoardEdge] progress paper count failed:", error.message);
    return null;
  }
  return count ?? 0;
});
