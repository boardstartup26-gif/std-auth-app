import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import {
  backLink,
  btnPrimary,
  cardInteractive,
  errorAlert,
  numericMono,
  pageShellWide,
  scoreBadgeClass,
  sectionLabel,
} from "@/lib/ui";

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

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("student_answers")
    .select(`
      id, submitted_at,
      questions ( question_number, year, subjects ( name ), marking_schemes ( total_marks ) ),
      evaluations ( marks_awarded )
    `)
    .eq("user_id", user.id)
    .order("submitted_at", { ascending: false });

  if (error) {
    return (
      <div className={pageShellWide}>
        <div className={errorAlert}>Failed to load history: {error.message}</div>
      </div>
    );
  }

  const rows = (data ?? []) as unknown as HistoryRow[];

  return (
    <div className={pageShellWide}>
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className={sectionLabel}>Past submissions</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Evaluation history</h1>
        </div>
        <Link href="/dashboard" className={backLink}>← Dashboard</Link>
      </div>

      {rows.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No evaluations yet. Submit your first answer to see results here.</p>
          <Link href="/evaluate" className={`${btnPrimary} mt-6`}>Start evaluation</Link>
        </div>
      ) : (
        <div className="mt-10 space-y-4">
          {rows.map((row) => {
            const q = row.questions;
            const evaluation = row.evaluations?.[0];
            const totalMarks = q?.marking_schemes?.[0]?.total_marks ?? 0;
            const awarded = evaluation?.marks_awarded ?? 0;

            return (
              <Link key={row.id} href={`/history/${row.id}`} className={cardInteractive}>
                <div className="flex items-center justify-between gap-6">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      <span className="font-sans">{q?.subjects?.name ?? "Unknown Subject"}</span>
                      {" — "}
                      <span className={numericMono}>
                        {q?.year ?? "—"} — Q{q?.question_number ?? "—"}
                      </span>
                    </p>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      {new Date(row.submitted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <span className={scoreBadgeClass(awarded, totalMarks)}>{awarded} / {totalMarks}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}