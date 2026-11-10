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
import { ScrollText } from "lucide-react";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { Hairline } from "@/app/_components/Hairline";
import { EmptyState } from "@/app/_components/states/EmptyState";
import { ReloadableError } from "@/app/_components/states/ErrorState";
import { numericFigures, sectionLabel } from "@/lib/ui";
import {
  computeStats,
  groupAttempts,
  type AttemptInput,
  type MarkingPoint,
} from "@/lib/history";
import { HistoryBrowser } from "./_components/HistoryBrowser";

export const dynamic = "force-dynamic";

// No margin rail on this surface. The rail is for running context, and
// everything it would carry here — count, distinct questions, average — is
// already in the stat row at the top of the content column, so the rail was
// repeating those numbers and then holding a column of empty paper down the
// length of a very long list. The content column takes the full measure
// instead.
const historyShell = "mx-auto min-h-screen max-w-5xl px-6 py-12";

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
    // The provider's message stays in the server log; the student gets a
    // sentence and a retry. (This used to print `error.message` on the page.)
    console.error("[BoardEdge] history read failed:", error.message);
    return (
      <div className={historyShell}>
        <p className={sectionLabel}>Past submissions</p>
        <h1 className="display-section mt-2">Your History</h1>
        <ReloadableError
          className="mt-10"
          title="We couldn’t load your results"
          message="Your submissions are safe — we just couldn’t fetch them this time. Try again in a moment."
          secondary={{ label: "Back to dashboard", href: "/dashboard" }}
        />
      </div>
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
    <div className={historyShell}>
      <p className={sectionLabel}>Past submissions</p>
      <h1 className="display-section mt-2">Your History</h1>
      <p className="mt-4 max-w-[var(--measure)] text-muted-foreground">
        Review past answers, revisit feedback, and track where you&rsquo;re improving.
      </p>

      {attempts.length === 0 ? (
        <>
          <Hairline className="my-8" />
          <EmptyState
            icon={ScrollText}
            title="No results yet"
            description="Answer a past-paper question and it’s marked point by point against the board’s scheme. Every marked answer is kept here so you can see what you’re improving."
            primary={{ label: "Practice a question", href: "/evaluate" }}
            secondary={{ label: "Build a practice paper", href: "/practice-paper" }}
          />
        </>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-border py-5 lg:grid-cols-4">
            {STATS.map(({ label, value, sub }) => (
              <div key={label}>
                <p className={sectionLabel}>{label}</p>
                <p className={`mt-1.5 text-xl font-semibold text-foreground ${numericFigures}`}>
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
    </div>
  );
}
