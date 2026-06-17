"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  backLink,
  btnPrimary,
  cardPadded,
  errorAlert,
  inputBase,
  mutedPanel,
  pageShell,
  scoreBadgeClass,
  sectionLabel,
} from "@/lib/ui";

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

function Section({ title, items, color }: { title: string; items: string[]; color: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className={`mb-3 text-xs font-semibold uppercase tracking-widest ${color}`}>
        {title}
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            — {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

const selectClass = `${inputBase} h-10 w-full`;
const textareaClass = `${inputBase} w-full px-3 py-2.5 disabled:bg-zinc-50 dark:disabled:bg-zinc-950/50`;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EvaluatePage() {
  const supabase = createClient();
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);

  const [subject, setSubject] = useState("");
  const [year, setYear] = useState<number | "">("");
  const [questionNumber, setQuestionNumber] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [studentAnswer, setStudentAnswer] = useState("");

  const [years, setYears] = useState<number[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);

  const [loadingYears, setLoadingYears] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Rate-Limit Feedback State
  const [limitReached, setLimitReached] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);

  // Evaluation Quality Feedback State
  const [evalRating, setEvalRating] = useState<"up" | "down" | null>(null);
  const [evalFeedbackText, setEvalFeedbackText] = useState("");
  const [evalFeedbackStatus, setEvalFeedbackStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  useEffect(() => {
    async function checkAuth() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setAuthChecked(true);
    }
    checkAuth();
  }, [router, supabase.auth]);

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
  }, [subject, supabase]);

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
  }, [subject, year, supabase]);

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

  async function handleSubmit() {
    if (!subject || !year || !questionNumber || !studentAnswer.trim()) return;

    setEvaluating(true);
    setResult(null);
    setError(null);
    setLimitReached(false);
    setFeedbackText("");
    setFeedbackSent(false);
    
    // Reset the evaluation feedback states for a fresh run
    setEvalRating(null);
    setEvalFeedbackText("");
    setEvalFeedbackStatus("idle");

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

  // Handle the submission for the quality of the evaluation
  async function handleEvalFeedbackSubmit() {
    if (!evalRating || evalFeedbackText.trim().length < 3) return;
    
    setEvalFeedbackStatus("submitting");
    try {
      const formattedMessage = `[${evalRating === "up" ? "👍" : "👎"}] ${evalFeedbackText.trim()}`;
      
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: formattedMessage }),
      });

      if (!res.ok) throw new Error("Feedback failed");
      setEvalFeedbackStatus("success");
    } catch {
      setEvalFeedbackStatus("error");
    }
  }

  const canSubmit = Boolean(subject && year && questionNumber && studentAnswer.trim());

  if (!authChecked) {
    return (
      <div className={`${pageShell} text-sm text-zinc-500 dark:text-zinc-400`}>
        Checking session…
      </div>
    );
  }

  return (
    <div className={pageShell}>
      <div className="mb-10 flex items-start justify-between gap-6">
        <div>
          <p className={sectionLabel}>Evaluation engine</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            New evaluation
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Select a past paper question, write your answer, and receive examiner-style feedback.
          </p>
        </div>
        <Link href="/dashboard" className={backLink}>
          ← Dashboard
        </Link>
      </div>

      <div className={cardPadded}>
        <h2 className={sectionLabel}>Select question</h2>

        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Subject</label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={selectClass}
            >
              <option value="">Select subject</option>
              {SUBJECTS.map((s) => (
                <option key={s.name} value={s.name} disabled={!s.available}>
                  {s.name}
                  {!s.available ? " — Coming soon" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Year</label>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value ? Number(e.target.value) : "")}
              disabled={!subject || loadingYears}
              className={selectClass}
            >
              <option value="">{loadingYears ? "Loading…" : "Select year"}</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Question</label>
            <select
              value={questionNumber}
              onChange={(e) => setQuestionNumber(e.target.value)}
              disabled={!year || loadingQuestions}
              className={selectClass}
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

        {questionNumber && (
          <div className={`${mutedPanel} mt-6`}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              Question reference
            </p>
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

      {questionNumber && (
        <div className={`${cardPadded} mt-6`}>
          <h2 className={sectionLabel}>Your answer</h2>

          <div className="mt-6 flex flex-col gap-6">
            <div className="flex flex-col gap-2">
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
                className={textareaClass}
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={!canSubmit || evaluating}
              className={btnPrimary}
            >
              {evaluating ? "Evaluating…" : "Evaluate"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-6 space-y-4">
          <div className={errorAlert}>{error}</div>

          {limitReached && (
            <div className={cardPadded}>
              {feedbackSent ? (
                <p className="text-sm text-emerald-700 dark:text-emerald-400">
                  Thanks — we&apos;ll take a look.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Help us prioritize — why do you need more evaluations today?
                  </p>
                  <textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="E.g., exam prep, testing different approaches…"
                    rows={2}
                    className={textareaClass}
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
                    className={`${btnPrimary} self-start`}
                  >
                    Send feedback
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {result && (
        <div className={`${cardPadded} mt-6`}>
          <div className="mb-8 flex items-center justify-between gap-4">
            <h2 className={sectionLabel}>Examiner feedback</h2>
            <span className={scoreBadgeClass(result.marks_awarded, result.total_marks)}>
              {result.marks_awarded} / {result.total_marks}
            </span>
          </div>

          <div className="space-y-8">
            <div className={mutedPanel}>
              <p className="text-sm italic leading-relaxed text-zinc-700 dark:text-zinc-300">
                &ldquo;{result.examiner_feedback}&rdquo;
              </p>
            </div>

            <Section
              title="Points awarded"
              items={result.points_hit}
              color="text-emerald-700 dark:text-emerald-400"
            />

            <Section
              title="Points missed"
              items={result.points_missed}
              color="text-red-700 dark:text-red-400"
            />

            <Section
              title="Conceptual errors"
              items={result.conceptual_errors}
              color="text-amber-700 dark:text-amber-400"
            />

            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className={sectionLabel}>Model answer</span>
                <span className="rounded-full border border-zinc-200 px-2.5 py-0.5 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                  {result.model_answer_source === "verified" ? "CISCE verified" : "AI generated"}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                {result.model_answer}
              </p>
            </div>
            
            {/* ─── Evaluation Quality Feedback Block ─── */}
            <div className="mt-8 border-t border-zinc-100 pt-6 dark:border-zinc-800/50">
              {evalFeedbackStatus === "success" ? (
                <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 py-4 text-sm font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Thank you! Your feedback helps improve the AI.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      Was this evaluation accurate?
                    </h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEvalRating("up")}
                        className={`rounded-lg border px-3 py-1.5 transition-colors ${
                          evalRating === "up"
                            ? "border-zinc-900 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                            : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                        }`}
                      >
                        👍
                      </button>
                      <button
                        onClick={() => setEvalRating("down")}
                        className={`rounded-lg border px-3 py-1.5 transition-colors ${
                          evalRating === "down"
                            ? "border-zinc-900 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                            : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                        }`}
                      >
                        👎
                      </button>
                    </div>
                  </div>

                  {evalRating && (
                    <div className="animate-in fade-in slide-in-from-top-2 flex flex-col gap-3">
                      <textarea
                        value={evalFeedbackText}
                        onChange={(e) => setEvalFeedbackText(e.target.value)}
                        placeholder="What did the AI get right or wrong?"
                        className={`${textareaClass} resize-none`}
                        rows={2}
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-red-500">
                          {evalFeedbackStatus === "error" && "Something went wrong. Try again."}
                        </span>
                        <button
                          onClick={handleEvalFeedbackSubmit}
                          disabled={evalFeedbackText.trim().length < 3 || evalFeedbackStatus === "submitting"}
                          className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                        >
                          {evalFeedbackStatus === "submitting" ? "Sending..." : "Submit Feedback"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}