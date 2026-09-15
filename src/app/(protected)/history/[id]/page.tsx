// src/app/(protected)/history/[id]/page.tsx
//
// The Practice page — one evaluated attempt, in full. This is the only surface
// allowed to render the student's own answer, the examiner's feedback and the
// model answer; the History list carries a derived one-line summary instead.
//
// Reads with the admin client but scopes on `user_id` as well as `id`, so a
// guessed row id belonging to someone else returns nothing rather than another
// student's answer.

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { backLink, numericMono, scoreBadgeClass, sectionLabel } from "@/lib/ui";
import { normaliseMarkingPoints, type MarkingPoint } from "@/lib/history";
import { PracticeReport, type PracticeRecord } from "./_components/PracticeReport";

export const dynamic = "force-dynamic";

interface DetailRow {
  id: string;
  answer_text: string;
  submitted_at: string;
  questions: {
    question_number: string | null;
    year: number | null;
    question_text: string | null;
    question_type: string | null;
    is_subjective: boolean | null;
    chapter: string | null;
    topic: string | null;
    subjects: { name: string } | null;
    marking_schemes: { total_marks: number; model_answer: string | null }[] | null;
  } | null;
  evaluations:
    | {
        marks_awarded: number | null;
        marking_points: MarkingPoint[] | null;
        points_hit: string[] | null;
        points_missed: string[] | null;
        conceptual_errors: string[] | null;
        examiner_feedback: string | null;
        model_answer: string | null;
        model_answer_source: string | null;
        improvement_tips: string[] | null;
        declared_marks: number | null;
      }[]
    | null;
}

export default async function PracticePage({
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
    .select(
      `
      id, answer_text, submitted_at,
      questions (
        question_number, year, question_text, question_type, is_subjective, chapter, topic,
        subjects ( name ),
        marking_schemes ( total_marks, model_answer )
      ),
      evaluations ( * )
    `
    )
    .eq("user_id", user.id)
    .eq("id", id)
    .single();

  if (error || !data) notFound();

  const row = data as unknown as DetailRow;
  const q = row.questions;
  const ev = row.evaluations?.[0] ?? null;
  const scheme = q?.marking_schemes?.[0];

  const totalMarks = Number(scheme?.total_marks ?? 0);
  const awarded = ev?.marks_awarded ?? 0;
  const percent = totalMarks > 0 ? Math.round((awarded / totalMarks) * 100) : null;

  const { points, synthesised } = normaliseMarkingPoints(ev ?? {});

  // `is_objective` is optional and may be undefined on older records, so the
  // check is explicit rather than truthy (handoff §9).
  const isObjective = q?.is_subjective === false || q?.question_type === "objective";

  const record: PracticeRecord = {
    subject: q?.subjects?.name ?? "Unknown subject",
    year: q?.year ?? null,
    questionNumber: q?.question_number ?? "—",
    questionText: q?.question_text ?? null,
    answerText: row.answer_text ?? "",
    awarded,
    totalMarks,
    examinerFeedback: ev?.examiner_feedback ?? null,
    markingPoints: points,
    pointsAreSynthesised: synthesised,
    conceptualErrors: ev?.conceptual_errors ?? [],
    modelAnswer: ev?.model_answer ?? scheme?.model_answer ?? null,
    modelAnswerSource: ev?.model_answer_source ?? "verified",
    improvementTips: ev?.improvement_tips ?? [],
    isObjective,
    declaredMarks: ev?.declared_marks ?? null,
  };

  const submitted = new Date(row.submitted_at).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <div className="flex items-center justify-between gap-4">
        <Link href="/history" className={backLink}>
          ← History
        </Link>
        <span className={`${numericMono} text-xs text-muted-foreground`}>{submitted}</span>
      </div>

      <p className={`${sectionLabel} mt-8`}>
        {record.subject}
        {q?.chapter ? ` · ${q.chapter}` : ""}
      </p>
      <h1 className="display-section mt-2">Practice</h1>

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className={scoreBadgeClass(awarded, totalMarks, "lg")}>
          {awarded} / {totalMarks}
        </span>
        {percent !== null ? (
          <span className={`${numericMono} text-sm text-muted-foreground`}>{percent}%</span>
        ) : null}
        <span className={`${numericMono} text-xs text-muted-foreground`}>
          {record.year ? `${record.year} · ` : ""}Q{record.questionNumber}
        </span>
      </div>

      {record.questionText ? (
        <div className="mt-8 border-l-2 border-rule pl-5">
          <p className={sectionLabel}>Question</p>
          <p className="mt-2 max-w-[var(--measure)] whitespace-pre-wrap text-[15px] font-medium leading-relaxed text-foreground">
            {record.questionText}
          </p>
        </div>
      ) : null}

      <PracticeReport record={record} />
    </div>
  );
}
