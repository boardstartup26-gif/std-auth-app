import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient, createAdminClient } from "@/lib/supabase/server";

type HistoryRow = {
  id: string;
  submitted_at: string;
  questions: {
    question_number: string;
    year: number;
    subjects: { name: string } | null;
    marking_schemes: { total_marks: number }[] | null;
  } | null;
  evaluations: { marks_awarded: number }[] | null;
};

function scoreColor(awarded: number, total: number) {
  if (!total) return "bg-gray-100 text-gray-700";
  const pct = (awarded / total) * 100;
  if (pct >= 75) return "bg-green-100 text-green-800";
  if (pct >= 50) return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
}

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("student_answers")
    .select(`
      id,
      submitted_at,
      questions (
        question_number,
        year,
        subjects ( name ),
        marking_schemes ( total_marks )
      ),
      evaluations ( marks_awarded )
    `)
    .eq("user_id", user.id)
    .order("submitted_at", { ascending: false });

  if (error) {
    return <div className="p-6 text-red-600">Failed to load history: {error.message}</div>;
  }

  const rows = (data ?? []) as unknown as HistoryRow[];

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Evaluation History</h1>
        <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
          ← Back to Dashboard
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-gray-500">No evaluations yet. Go solve a question.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const q = row.questions;
            const evaluation = row.evaluations?.[0];
            const totalMarks = q?.marking_schemes?.[0]?.total_marks ?? 0;
            const awarded = evaluation?.marks_awarded ?? 0;

            return (
              <Link
                key={row.id}
                href={`/history/${row.id}`}
                className="block border rounded-lg p-4 hover:shadow-md transition-shadow bg-white"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {q?.subjects?.name ?? "Unknown Subject"} — {q?.year ?? "—"} — Q{q?.question_number ?? "—"}
                    </p>
                    <p className="text-sm text-gray-500">
                      {new Date(row.submitted_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${scoreColor(awarded, totalMarks)}`}>
                    {awarded} / {totalMarks}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}