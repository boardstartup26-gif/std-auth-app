import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import {
  backLink,
  cardPadded,
  mutedPanel,
  pageShell,
  scoreBadgeClass,
  sectionLabel,
} from "@/lib/ui";

type DetailRow = {
  id: string;
  answer_text: string;
  submitted_at: string;
  questions: {
    question_number: string;
    year: number;
    question_text: string | null;
    subjects: { name: string } | null;
    marking_schemes: { total_marks: number; model_answer: string | null }[] | null;
  } | null;
  evaluations: {
    marks_awarded: number;
    points_hit: string[];
    points_missed: string[];
    conceptual_errors: string[];
    examiner_feedback: string | null;
    model_answer: string | null;
    model_answer_source: string | null;
    declared_marks: number | null;
  }[] | null;
};

function FeedbackList({ items }: { items: string[] }) {
  if (!items.length) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">None recorded.</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((point, i) => (
        <li key={i} className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          — {point}
        </li>
      ))}
    </ul>
  );
}

export default async function HistoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("student_answers")
    .select(`
      id,
      answer_text,
      submitted_at,
      questions (
        question_number,
        year,
        question_text,
        subjects ( name ),
        marking_schemes ( total_marks, model_answer )
      ),
      evaluations (
        marks_awarded,
        points_hit,
        points_missed,
        conceptual_errors,
        examiner_feedback,
        model_answer,
        model_answer_source,
        declared_marks
      )
    `)
    .eq("user_id", user.id)
    .eq("id", id)
    .single();

  if (error || !data) notFound();

  const row = data as unknown as DetailRow;
  const q = row.questions;
  const evaluation = row.evaluations?.[0];
  const scheme = q?.marking_schemes?.[0];

  const totalMarks = scheme?.total_marks ?? 0;
  const awarded = evaluation?.marks_awarded ?? 0;
  const modelAnswer = evaluation?.model_answer ?? scheme?.model_answer ?? null;
  const modelAnswerSource = evaluation?.model_answer_source ?? "verified";

  return (
    <div className={`${pageShell} space-y-8`}>
      <div className="flex items-center justify-between gap-4">
        <Link href="/history" className={backLink}>
          ← History
        </Link>
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          {new Date(row.submitted_at).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className={sectionLabel}>Evaluation result</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            {q?.subjects?.name ?? "Unknown Subject"} — {q?.year ?? "—"} — Q
            {q?.question_number ?? "—"}
          </h1>
        </div>
        <span className={scoreBadgeClass(awarded, totalMarks, "lg")}>
          {awarded} / {totalMarks}
        </span>
      </div>

      {q?.question_text && (
        <section className={cardPadded}>
          <h2 className={sectionLabel}>Question</h2>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {q.question_text}
          </p>
        </section>
      )}

      <section className={cardPadded}>
        <h2 className={sectionLabel}>Your answer</h2>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          {row.answer_text}
        </p>
        {evaluation?.declared_marks != null && (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
            Declared marks: {evaluation.declared_marks}
          </p>
        )}
      </section>

      <section className={cardPadded}>
        <h2 className={sectionLabel}>Examiner feedback</h2>
        <div className={`${mutedPanel} mt-4`}>
          <p className="whitespace-pre-wrap text-sm italic leading-relaxed text-zinc-700 dark:text-zinc-300">
            {evaluation?.examiner_feedback ?? "—"}
          </p>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            Points hit
          </h2>
          <div className="mt-4">
            <FeedbackList items={evaluation?.points_hit ?? []} />
          </div>
        </section>

        <section className="rounded-2xl border border-red-200 bg-red-50 p-6 dark:border-red-900/50 dark:bg-red-950/30">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-red-700 dark:text-red-400">
            Points missed
          </h2>
          <div className="mt-4">
            <FeedbackList items={evaluation?.points_missed ?? []} />
          </div>
        </section>
      </div>

      {evaluation?.conceptual_errors && evaluation.conceptual_errors.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900/50 dark:bg-amber-950/30">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400">
            Conceptual errors
          </h2>
          <div className="mt-4">
            <FeedbackList items={evaluation.conceptual_errors} />
          </div>
        </section>
      )}

      {modelAnswer && (
        <section className={cardPadded}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className={sectionLabel}>Model answer</h2>
            <span className="rounded-full border border-zinc-200 px-2.5 py-0.5 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
              {modelAnswerSource === "verified" ? "CISCE verified" : "AI generated"}
            </span>
          </div>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {modelAnswer}
          </p>
        </section>
      )}
    </div>
  );
}
