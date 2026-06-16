"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Question {
  id: string;
  question_number: string;
  question_text: string;
}

interface EvaluationResult {
  marks_awarded: number;
  total_marks: number;
  points_hit: string[];
  points_missed: string[];
  conceptual_errors: string[];
  model_answer: string;
  model_answer_source: "verified" | "ai_generated";
  examiner_feedback: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SUBJECTS = [
  { name: "Chemistry", available: true },
  { name: "Physics", available: false },
  { name: "Biology", available: false },
  { name: "Geography", available: false },
];

function ScoreBadge({ awarded, total }: { awarded: number; total: number }) {
  const pct = total > 0 ? awarded / total : 0;
  const color =
    pct >= 0.75
      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
      : pct >= 0.4
        ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
        : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800";
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold ${color}`}>
      {awarded} / {total}
    </span>
  );
}

function Section({ title, items, color }: { title: string; items: string[]; color: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className={`mb-2 text-xs font-semibold uppercase tracking-widest ${color}`}>{title}</div>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
            — {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EvaluatePage() {
  const supabase = createClient();
  const router = useRouter();

  // Auth gate
  const [authChecked, setAuthChecked] = useState(false);

  // Selections
  const [subject, setSubject] = useState("");
  const [year, setYear] = useState<number | "">("");
  const [questionNumber, setQuestionNumber] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [studentAnswer, setStudentAnswer] = useState("");

  // Dropdown options
  const [years, setYears] = useState<number[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);

  // UI state
  const [loadingYears, setLoadingYears] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);

  // ── Auth check on mount ─────────────────────────────────────────────────
  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setAuthChecked(true);
    }
    checkAuth();
  }, []);

  // ── Fetch years when subject changes ──────────────────────────────────────
  useEffect(() => {
    if (!subject) {
      setYears([]);
      setYear("");
      setQuestions([]);
      setQuestionNumber("");
      setQuestionText("");
      return;
    }

    async function fetchYears() {
      setLoadingYears(true);
      setYear("");
      setQuestions([]);
      setQuestionNumber("");
      setQuestionText("");
      setResult(null);
      setError(null);

      const { data: subjectRow } = await supabase
        .from("subjects")
        .select("id")
        .eq("name", subject)
        .single();

      if (!subjectRow) {
        setLoadingYears(false);
        return;
      }

      const { data } = await supabase
        .from("questions")
        .select("year")
        .eq("subject_id", subjectRow.id)
        .eq("is_subjective", true)
        .order("year", { ascending: false });

      const uniqueYears = [...new Set((data ?? []).map((r: { year: number }) => r.year))];
      setYears(uniqueYears);
      setLoadingYears(false);
    }

    fetchYears();
  }, [subject]);

  // ── Fetch questions when year changes ─────────────────────────────────────
  useEffect(() => {
    if (!subject || !year) {
      setQuestions([]);
      setQuestionNumber("");
      setQuestionText("");
      return;
    }

    async function fetchQuestions() {
      setLoadingQuestions(true);
      setQuestionNumber("");
      setQuestionText("");
      setResult(null);
      setError(null);

      const { data: subjectRow } = await supabase
        .from("subjects")
        .select("id")
        .eq("name", subject)
        .single();

      if (!subjectRow) {
        setLoadingQuestions(false);
        return;
      }

      const { data } = await supabase
        .from("questions")
        .select("id, question_number, question_text")
        .eq("subject_id", subjectRow.id)
        .eq("year", year)
        .eq("is_subjective", true)
        .order("question_number", { ascending: true });

      setQuestions(data ?? []);
      setLoadingQuestions(false);
    }

    fetchQuestions();
  }, [subject, year]);

  // ── Set question text when question number changes ────────────────────────
  useEffect(() => {
    if (!questionNumber) {
      setQuestionText("");
      return;
    }
    const q = questions.find((q) => q.question_number === questionNumber);
    setQuestionText(q?.question_text ?? "");
    setResult(null);
    setError(null);
  }, [questionNumber, questions]);

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!subject || !year || !questionNumber || !studentAnswer.trim()) return;

    setEvaluating(true);
    setResult(null);
    setError(null);
    setLimitReached(false);
    setFeedbackText("");
    setFeedbackSent(false);

    try {
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_number: questionNumber,
          year: Number(year),
          paper: "1",
          subject,
          student_answer: studentAnswer,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          setLimitReached(true);
        }
        setError(data?.error ?? "Evaluation failed. Try again.");
      } else {
        setResult(data as EvaluationResult);
      }
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setEvaluating(false);
    }
  }

  const canSubmit = Boolean(subject && year && questionNumber && studentAnswer.trim());

  if (!authChecked) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-16 text-sm text-zinc-500 dark:text-zinc-400">
        Checking session…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          New evaluation
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Select a past paper question, write your answer, and get examiner-style feedback.
        </p>
      </div>

      {/* Question selector */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
          Select question
        </h2>

        <div className="grid gap-4 sm:grid-cols-3">
          {/* Subject */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Subject</label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:ring-zinc-400"
            >
              <option value="">Select subject</option>
              {SUBJECTS.map((s) => (
                <option key={s.name} value={s.name} disabled={!s.available}>
                  {s.name}{!s.available ? " — Coming soon" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Year */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Year</label>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value ? Number(e.target.value) : "")}
              disabled={!subject || loadingYears}
              className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:ring-zinc-400"
            >
              <option value="">{loadingYears ? "Loading…" : "Select year"}</option>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Question number */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Question</label>
            <select
              value={questionNumber}
              onChange={(e) => setQuestionNumber(e.target.value)}
              disabled={!year || loadingQuestions}
              className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:ring-zinc-400"
            >
              <option value="">{loadingQuestions ? "Loading…" : "Select question"}</option>
              {questions.map((q) => (
                <option key={q.id} value={q.question_number}>
                  Q{q.question_number}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Question text */}
        {questionNumber && (
          <div className="mt-5 rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="mb-1 text-xs font-medium text-zinc-400 dark:text-zinc-500">
              Question Reference
            </div>
            {questionText.trim() ? (
              <p className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                {questionText}
              </p>
            ) : (
              <p className="text-sm italic leading-relaxed text-zinc-500 dark:text-zinc-400">
                Question text not yet available. Please refer to your physical question paper.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Answer + submission */}
      {questionNumber && (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Your answer
          </h2>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Write your answer
              </label>
              <textarea
                value={studentAnswer}
                onChange={(e) => setStudentAnswer(e.target.value)}
                rows={8}
                disabled={!questionText.trim()}
                placeholder={
                  questionText.trim()
                    ? "Write your detailed analysis or descriptive answer here…"
                    : "Question text not available — evaluation unavailable until added."
                }
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:opacity-70 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-600 dark:focus:ring-zinc-400 dark:disabled:bg-zinc-950/50"
              />
            </div>

            <div className="flex items-end gap-4">
              <button
                onClick={handleSubmit}
                disabled={!canSubmit || evaluating}
                className="h-10 rounded-lg bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {evaluating ? "Evaluating…" : "Evaluate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>

          {/* Feedback box — only shown if limit reached */}
          {limitReached && (
            <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              {feedbackSent ? (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                  Thanks — we'll take a look.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Help us prioritize — why do you need more evaluations today?
                  </p>
                  <textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="E.g., exam prep, testing different approaches…"
                    rows={2}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-600 dark:focus:ring-zinc-400"
                  />
                  <button
                    onClick={async () => {
                      if (!feedbackText.trim()) return;
                      try {
                        const res = await fetch("/api/feedback", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ message: feedbackText }),
                        });
                        if (res.ok) setFeedbackSent(true);
                      } catch (err) {
                        console.error("Feedback send failed:", err);
                      }
                    }}
                    className="self-start rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    Send Feedback
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
              Examiner feedback
            </h2>
            <ScoreBadge awarded={result.marks_awarded} total={result.total_marks} />
          </div>

          <div className="space-y-6">

            {/* Examiner feedback */}
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
              <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 italic">
                "{result.examiner_feedback}"
              </p>
            </div>

            {/* Points hit */}
            <Section
              title="Points awarded"
              items={result.points_hit}
              color="text-emerald-600 dark:text-emerald-400"
            />

            {/* Points missed */}
            <Section
              title="Points missed"
              items={result.points_missed}
              color="text-red-500 dark:text-red-400"
            />

            {/* Conceptual errors */}
            <Section
              title="Conceptual errors"
              items={result.conceptual_errors}
              color="text-amber-600 dark:text-amber-400"
            />

            {/* Model answer */}
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                  Model answer
                </span>
                <span className="rounded-full border border-zinc-200 px-2 py-0.5 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  {result.model_answer_source === "verified" ? "CISCE verified" : "AI generated"}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                {result.model_answer}
              </p>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}