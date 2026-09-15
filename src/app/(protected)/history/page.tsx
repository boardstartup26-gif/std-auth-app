// src/app/(protected)/history/page.tsx
//
// Server half of the History page: authenticate, read the full evaluation row
// per submission, derive everything, and hand the browser a view model.
//
// The whole evaluation row is read (per the rebuild brief) but deliberately
// not passed on. `buildViewModel` narrows each row to the handful of derived
// values the cards render, so `examiner_feedback`, `model_answer` and the
// student's own answer text never enter the client bundle — the Results page
// stays the only surface that shows them.

import { redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { Hairline } from "@/app/_components/Hairline";
import { Rail, RailContent, RailLayout, RailNote } from "@/app/_components/Rail";
import { btnPrimary, errorAlert, numericMono, sectionLabel } from "@/lib/ui";
import {
  computeStats,
  groupAttempts,
  type AttemptInput,
  type MarkingPoint,
} from "@/lib/history";
import { HistoryBrowser } from "./_components/HistoryBrowser";

export const dynamic = "force-dynamic";

// PostgREST shape of the embedded select below. `evaluations (*)` is a
// deliberate star: the table has picked up columns the repo's migrations never
// created (marking_points, evaluation_mode, rubric_scores, factual_accuracy,
// textual_evidence_*), and naming columns explicitly would break this page the
// next time that happens out-of-band.
interface HistoryRow {
  id: string;
  submitted_at: string;
  questions: {
    id: string;
    question_number: string | null;
    year: number | null;
    question_text: string | null;
    question_type: string | null;
    chapter: string | null;
    topic: string | null;
    subjects: { name: string } | null;
    marking_schemes: { total_marks: number }[] | null;
  } | null;
  evaluations:
    | {
        marks_awarded: number | null;
        marking_points: MarkingPoint[] | null;
        points_missed: string[] | null;
        conceptual_errors: string[] | null;
      }[]
    | null;
}

function buildViewModel(rows: HistoryRow[]): AttemptInput[] {
  return rows.map((row) => {
    const q = row.questions;
    const ev = row.evaluations?.[0] ?? null;
    return {
      id: row.id,
      submittedAt: row.submitted_at,
      questionId: q?.id ?? null,
      questionNumber: q?.question_number ?? "—",
      questionText: q?.question_text ?? "",
      year: q?.year ?? null,
      subject: q?.subjects?.name ?? "Unknown subject",
      chapter: q?.chapter ?? null,
      topic: q?.topic ?? null,
      questionType: q?.question_type ?? null,
      // total_marks is numeric in Postgres, which PostgREST can hand back as a
      // string — Number() here keeps the score maths out of string concatenation.
      totalMarks: Number(q?.marking_schemes?.[0]?.total_marks ?? 0),
      evaluation: ev
        ? {
            marks_awarded: ev.marks_awarded,
            marking_points: ev.marking_points ?? null,
            points_missed: ev.points_missed ?? null,
            conceptual_errors: ev.conceptual_errors ?? null,
          }
        : null,
    };
  });
}

export default async function HistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("student_answers")
    .select(
      `
      id, submitted_at,
      questions (
        id, question_number, year, question_text, question_type, chapter, topic,
        subjects ( name ),
        marking_schemes ( total_marks )
      ),
      evaluations ( * )
    `
    )
    .eq("user_id", user.id)
    .order("submitted_at", { ascending: false });

  if (error) {
    return (
      <RailLayout wide>
        <Rail>
          <RailNote label="Section">History</RailNote>
        </Rail>
        <RailContent>
          <div className={errorAlert}>Failed to load history: {error.message}</div>
        </RailContent>
      </RailLayout>
    );
  }

  const attempts = buildViewModel((data ?? []) as unknown as HistoryRow[]);
  const stats = computeStats(attempts);
  const groups = groupAttempts(attempts);

  const trendLabel =
    stats.trend === null
      ? "Not enough data yet"
      : `${stats.trend.deltaPoints > 0 ? "+" : ""}${stats.trend.deltaPoints} pts`;

  const STATS = [
    { label: "Answers evaluated", value: String(stats.evaluated), sub: `${groups.length} distinct questions` },
    {
      label: "Average score",
      value: stats.averagePercent === null ? "—" : `${stats.averagePercent}%`,
      sub: "Across all marked attempts",
    },
    {
      label: "Most practised",
      value: stats.topSubject?.name ?? "—",
      sub: stats.topSubject ? `${stats.topSubject.count} attempts` : "No attempts yet",
    },
    {
      label: "Recent trend",
      value: trendLabel,
      sub:
        stats.trend === null
          ? "Needs 4+ marked attempts"
          : `Last ${stats.trend.sampleSize} vs previous ${stats.trend.sampleSize}`,
    },
  ];

  return (
    <RailLayout wide>
      <Rail>
        <RailNote label="Section">History</RailNote>
        <RailNote label="Evaluated">
          <span className={numericMono}>{stats.evaluated}</span>
        </RailNote>
        <RailNote label="Questions">
          <span className={numericMono}>{groups.length}</span>
        </RailNote>
        {stats.averagePercent !== null ? (
          <RailNote label="Average">
            <span className={numericMono}>{stats.averagePercent}%</span>
          </RailNote>
        ) : null}
      </Rail>

      <RailContent>
        <p className={sectionLabel}>Past submissions</p>
        <h1 className="display-section mt-2">Your History</h1>
        <p className="mt-4 max-w-[var(--measure)] text-muted-foreground">
          Review past answers, revisit feedback, and track where you&rsquo;re improving.
        </p>

        {attempts.length === 0 ? (
          <>
            <Hairline className="my-8" />
            <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                No evaluations yet. Submit your first answer to see results here.
              </p>
              <Link href="/evaluate" className={`${btnPrimary} mt-6`}>
                Start evaluation
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-border py-5 lg:grid-cols-4">
              {STATS.map(({ label, value, sub }) => (
                <div key={label}>
                  <p className={sectionLabel}>{label}</p>
                  <p className={`mt-1.5 text-xl font-semibold text-foreground ${numericMono}`}>
                    {value}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
                </div>
              ))}
            </div>

            <div className="mt-8">
              <HistoryBrowser groups={groups} />
            </div>
          </>
        )}
      </RailContent>
    </RailLayout>
  );
}
