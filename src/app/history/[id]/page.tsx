import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient, createAdminClient } from "@/lib/supabase/server";

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

function scoreColor(awarded: number, total: number) {
  if (!total) return "bg-gray-100 text-gray-700";
  const pct = (awarded / total) * 100;
  if (pct >= 75) return "bg-green-100 text-green-800";
  if (pct >= 50) return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
}

export default async function HistoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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
  // Fallback for pre-migration rows: no persisted model_answer → use DB scheme, label as verified
  const modelAnswer = evaluation?.model_answer ?? scheme?.model_answer ?? null;
  const modelAnswerSource = evaluation?.model_answer_source ?? "verified";

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/history" className="text-sm text-blue-600 hover:underline">
          ← Back to History
        </Link>
        <span className="text-sm text-gray-500">
          {new Date(row.submitted_at).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">
          {q?.subjects?.name ?? "Unknown Subject"} — {q?.year ?? "—"} — Q{q?.question_number ?? "—"}
        </h1>
        <span className={`px-4 py-1.5 rounded-full text-lg font-bold ${scoreColor(awarded, totalMarks)}`}>
          {awarded} / {totalMarks}
        </span>
      </div>

      {q?.question_text && (
        <div className="border rounded-lg p-4 bg-white">
          <h2 className="font-semibold mb-1">Question</h2>
          <p className="text-gray-700 whitespace-pre-wrap">{q.question_text}</p>
        </div>
      )}

      <div className="border rounded-lg p-4 bg-white">
        <h2 className="font-semibold mb-1">Your Answer</h2>
        <p className="text-gray-700 whitespace-pre-wrap">{row.answer_text}</p>
        {evaluation?.declared_marks != null && (
          <p className="text-sm text-gray-500 mt-2">Declared marks: {evaluation.declared_marks}</p>
        )}
      </div>

      <div className="border rounded-lg p-4 bg-white">
        <h2 className="font-semibold mb-1">Examiner Feedback</h2>
        <p className="text-gray-700 whitespace-pre-wrap">{evaluation?.examiner_feedback ?? "—"}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="border rounded-lg p-4 bg-green-50">
          <h2 className="font-semibold mb-2 text-green-800">Points Hit</h2>
          {evaluation?.points_hit?.length ? (
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
              {evaluation.points_hit.map((point, i) => <li key={i}>{point}</li>)}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">None recorded.</p>
          )}
        </div>

        <div className="border rounded-lg p-4 bg-red-50">
          <h2 className="font-semibold mb-2 text-red-800">Points Missed</h2>
          {evaluation?.points_missed?.length ? (
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
              {evaluation.points_missed.map((point, i) => <li key={i}>{point}</li>)}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">None recorded.</p>
          )}
        </div>
      </div>

      {evaluation?.conceptual_errors && evaluation.conceptual_errors.length > 0 && (
        <div className="border rounded-lg p-4 bg-orange-50">
          <h2 className="font-semibold mb-2 text-orange-800">Conceptual Errors</h2>
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
            {evaluation.conceptual_errors.map((err, i) => <li key={i}>{err}</li>)}
          </ul>
        </div>
      )}

      {modelAnswer && (
        <div className="border rounded-lg p-4 bg-blue-50">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-blue-800">Model Answer</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              modelAnswerSource === "verified" ? "bg-blue-200 text-blue-900" : "bg-gray-200 text-gray-700"
            }`}>
              {modelAnswerSource === "verified" ? "CISCE Verified" : "AI Generated"}
            </span>
          </div>
          <p className="text-gray-700 whitespace-pre-wrap">{modelAnswer}</p>
        </div>
      )}
    </div>
  );
}