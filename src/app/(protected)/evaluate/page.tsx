"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PremiumGate, WaitlistCapture } from "@/app/_components/PremiumGate";
import { createClient } from "@/lib/supabase/client";
import {
  backLink,
  btnPrimary,
  cardPadded,
  errorAlert,
  inputBase,
  mutedPanel,
  numericMono,
  pageShell,
  scoreBadgeClass,
  sectionLabel,
} from "@/lib/ui";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Question {
  id: string;
  question_number: string;
  question_text: string;
  is_subjective: boolean;
  question_type: string | null;
  options: string[] | null;
  diagram_required: boolean | null;
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
  improvement_tips: string[];
  is_objective?: boolean;
  correct_answer?: string;
  is_correct?: boolean;
  token_cost: number;
  tokens_remaining: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SUBJECTS = [
  { name: "Chemistry",  available: true },
  { name: "Physics",    available: true },
  { name: "Biology",    available: true },
  { name: "Geography",  available: true },
];

const DAILY_TOKEN_LIMIT = 10;

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, items, color }: { title: string; items: string[]; color: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className={`mb-3 text-xs font-semibold uppercase tracking-widest ${color}`}>{title}</div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="text-sm leading-relaxed text-foreground/90">— {item}</li>
        ))}
      </ul>
    </div>
  );
}

function TokenBadge({ tokensRemaining, tokenCost }: { tokensRemaining: number; tokenCost: number }) {
  const pct = (tokensRemaining / DAILY_TOKEN_LIMIT) * 100;
  const color = pct > 50 ? "text-emerald-400" : pct > 20 ? "text-amber-400" : "text-red-400";

  return (
    <div className="flex items-center gap-1.5 text-xs font-medium">
      <span className={`${numericMono} ${color}`}>{tokensRemaining}</span>
      <span className={color}>token{tokensRemaining !== 1 ? "s" : ""} remaining today</span>
      {tokenCost > 0 && (
        <span className="ml-1 text-muted-foreground">
          · this question costs <span className={numericMono}>{tokenCost}</span>
        </span>
      )}
    </div>
  );
}

const selectClass   = `${inputBase} h-10 w-full`;
const textareaClass = `${inputBase} w-full px-3 py-2.5 disabled:bg-card/50`;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EvaluatePage() {
  const supabase = createClient();
  const router   = useRouter();

  const [authChecked,       setAuthChecked]       = useState(false);
  const [subject,           setSubject]           = useState("");
  const [year,              setYear]              = useState<number | "">("");
  const [questionType,      setQuestionType]      = useState<string>("");
  const [questionNumber,    setQuestionNumber]    = useState("");
  const [selectedQuestion,  setSelectedQuestion]  = useState<Question | null>(null);
  const [studentAnswer,     setStudentAnswer]     = useState("");
  const [years,             setYears]             = useState<number[]>([]);
  const [questions,         setQuestions]         = useState<Question[]>([]);
  const [loadingYears,      setLoadingYears]      = useState(false);
  const [loadingQuestions,  setLoadingQuestions]  = useState(false);
  const [evaluating,        setEvaluating]        = useState(false);
  const [result,            setResult]            = useState<EvaluationResult | null>(null);
  const [error,             setError]             = useState<string | null>(null);
  const [premiumUnlocked,   setPremiumUnlocked]   = useState(false);
  const [tokensRemaining,   setTokensRemaining]   = useState<number>(DAILY_TOKEN_LIMIT);
  const [limitReached,      setLimitReached]      = useState(false);
  const [feedbackText,      setFeedbackText]      = useState("");
  const [feedbackSent,      setFeedbackSent]      = useState(false);
  const questionOpenedAt = useRef<number | null>(null);
  const [evalRating,        setEvalRating]        = useState<"up" | "down" | null>(null);
  const [evalFeedbackText,  setEvalFeedbackText]  = useState("");
  const [evalFeedbackStatus, setEvalFeedbackStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  // ─── Auth ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function checkAuth() {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (!user || error) {
        await supabase.auth.signOut();
        router.push("/login");
        return;
      }
      setAuthChecked(true);
    }
    checkAuth();
  }, [router, supabase.auth]);

  // ─── Token fetch ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!authChecked) return;
    async function fetchTokens() {
      try {
        const res = await fetch("/api/usage");
        if (res.ok) {
          const data = await res.json();
          setTokensRemaining(data.tokens_remaining ?? DAILY_TOKEN_LIMIT);
        }
      } catch {}
    }
    fetchTokens();
  }, [authChecked]);

  // ─── Cascading dropdowns ──────────────────────────────────────────────────

  useEffect(() => {
    if (!subject) {
      setYears([]); setYear(""); setQuestions([]); setQuestionNumber(""); setSelectedQuestion(null);
      return;
    }
    async function fetchYears() {
      setLoadingYears(true);
      setYear(""); setQuestionType(""); setQuestions([]); setQuestionNumber("");
      setSelectedQuestion(null); setResult(null); setError(null);

      const { data: subjectRow } = await supabase.from("subjects").select("id").eq("name", subject).single();
      if (!subjectRow) { setLoadingYears(false); return; }

      const { data } = await supabase
        .from("questions").select("year").eq("subject_id", subjectRow.id).order("year", { ascending: false });

      setYears([...new Set((data ?? []).map((r: { year: number }) => r.year))]);
      setLoadingYears(false);
    }
    fetchYears();
  }, [subject, supabase]);

  useEffect(() => {
    if (!subject || !year) {
      setQuestions([]); setQuestionNumber(""); setSelectedQuestion(null);
      return;
    }
    async function fetchQuestions() {
      setLoadingQuestions(true);
      setQuestionType(""); setQuestionNumber(""); setSelectedQuestion(null); setResult(null); setError(null);

      const { data: subjectRow } = await supabase.from("subjects").select("id").eq("name", subject).single();
      if (!subjectRow) { setLoadingQuestions(false); return; }

      const { data } = await supabase
        .from("questions")
        .select("id, question_number, question_text, is_subjective, question_type, options")
        .eq("subject_id", subjectRow.id)
        .eq("year", year)
        .order("question_number", { ascending: true });

      setQuestions((data ?? []) as Question[]);
      setLoadingQuestions(false);
    }
    fetchQuestions();
  }, [subject, year, supabase]);

  useEffect(() => {
    if (!questionNumber) { setSelectedQuestion(null); return; }
    const q = questions.find((q) => q.question_number === questionNumber) ?? null;
    setSelectedQuestion(q);
    setStudentAnswer(""); setResult(null); setError(null);
    if (q) {
      questionOpenedAt.current = Date.now();
      supabase.from("events").insert({ event: "question_opened", meta: { question_id: q.id, subject, year } }).then(() => {});
    }
  }, [questionNumber, questions]);

  // ─── Submit ───────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!subject || !year || !questionNumber || !studentAnswer.trim()) return;

    if (selectedQuestion) {
      const timeToSubmit = questionOpenedAt.current ? Date.now() - questionOpenedAt.current : null;
      supabase.from("events").insert({
        event: "answer_submitted",
        meta: {
          question_id: selectedQuestion.id, subject, year,
          answer_length: studentAnswer.trim().length,
          time_to_submit_ms: timeToSubmit,
          is_subjective: selectedQuestion.is_subjective,
        },
      }).then(() => {});
    }

    setEvaluating(true); setResult(null); setError(null);
    setLimitReached(false); setFeedbackText(""); setFeedbackSent(false);
    setEvalRating(null); setEvalFeedbackText(""); setEvalFeedbackStatus("idle");

    try {
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_number: questionNumber, year: Number(year), paper: "1", subject, student_answer: studentAnswer }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          setLimitReached(true);
          if (data.tokens_remaining !== undefined) setTokensRemaining(data.tokens_remaining);
        }
        setError(data?.error ?? "Evaluation failed. Try again.");
      } else {
        setResult(data as EvaluationResult);
        if (data.tokens_remaining !== undefined) setTokensRemaining(data.tokens_remaining);
      }
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setEvaluating(false);
    }
  }

  // ─── Eval quality feedback ────────────────────────────────────────────────

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
      if (!res.ok) throw new Error();
      setEvalFeedbackStatus("success");
    } catch {
      setEvalFeedbackStatus("error");
    }
  }

  // ─── Derived state ────────────────────────────────────────────────────────

  const questionTypes: { value: string; label: string }[] = (() => {
    if (!questions.length) return [];
    const seen = new Set<string>();
    const types: { value: string; label: string }[] = [];
    for (const q of questions) {
      const key = q.is_subjective ? "subjective" : (q.question_type ?? "objective");
      if (!seen.has(key)) {
        seen.add(key);
        const label =
          key === "subjective"   ? "Subjective (written)"
          : key === "mcq"        ? "MCQ"
          : key === "true_false" ? "True / False"
          : key === "fill_blank" ? "Fill in the blank"
          : key === "match"      ? "Match the following"
          : key === "short_answer" ? "Short answer"
          : "Objective";
        types.push({ value: key, label });
      }
    }
    return types;
  })();

  const filteredQuestions = questionType
    ? questions.filter((q) => (q.is_subjective ? "subjective" : (q.question_type ?? "objective")) === questionType)
    : [];

  const tokenCost = selectedQuestion ? (selectedQuestion.is_subjective ? 3 : 1) : 0;
  const canSubmit = Boolean(subject && year && questionType && questionNumber && studentAnswer.trim() && !evaluating);

  // ─── Auth gate ────────────────────────────────────────────────────────────

  if (!authChecked) {
    return <div className={`${pageShell} text-sm text-muted-foreground`}>Checking session…</div>;
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={pageShell}>

      {/* Header */}
      <div className="mb-10 flex items-start justify-between gap-6">
        <div>
          <p className={sectionLabel}>Evaluation engine</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">New evaluation</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Select a past paper question, write your answer, and receive examiner-style feedback.
          </p>
        </div>
        <Link href="/dashboard" className={backLink}>← Dashboard</Link>
      </div>

      {/* Question selector */}
      <div className={cardPadded}>
        <div className="flex items-center justify-between">
          <h2 className={sectionLabel}>Select question</h2>
          <TokenBadge tokensRemaining={tokensRemaining} tokenCost={tokenCost} />
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          {/* Subject */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground">Subject</label>
            <select value={subject} onChange={(e) => setSubject(e.target.value)} className={selectClass}>
              <option value="">Select subject</option>
              {SUBJECTS.map((s) => (
                <option key={s.name} value={s.name} disabled={!s.available}>
                  {s.name}{!s.available ? " — Coming soon" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Year */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground">Year</label>
            <select
              value={year}
              onChange={(e) => {
                setYear(e.target.value ? Number(e.target.value) : "");
                setQuestionType(""); setQuestionNumber(""); setSelectedQuestion(null);
              }}
              disabled={!subject || loadingYears}
              className={selectClass}
            >
              <option value="">{loadingYears ? "Loading…" : "Select year"}</option>
              {years.map((y) => (
                <option key={y} value={y} className={numericMono}>{y}</option>
              ))}
            </select>
          </div>

          {/* Question type */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground">Question type</label>
            <select
              value={questionType}
              onChange={(e) => { setQuestionType(e.target.value); setQuestionNumber(""); setSelectedQuestion(null); }}
              disabled={!year || loadingQuestions || !questionTypes.length}
              className={selectClass}
            >
              <option value="">{loadingQuestions ? "Loading…" : !year ? "Select year first" : "Select type"}</option>
              {questionTypes.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Question — appears once type is selected */}
        {questionType && (
          <div className="mt-4 flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground">Question</label>
            <select
              value={questionNumber}
              onChange={(e) => setQuestionNumber(e.target.value)}
              disabled={!filteredQuestions.length}
              className={selectClass}
            >
              <option value="">{filteredQuestions.length ? "Select question" : "No questions available"}</option>
              {filteredQuestions.map((q) => (
                <option key={q.id} value={q.question_number}>
                  Q{q.question_number}
                  {q.question_text?.trim() ? ` — ${q.question_text.slice(0, 60)}${q.question_text.length > 60 ? "…" : ""}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Question reference panel */}
        {selectedQuestion && (
          <div className={`${mutedPanel} mt-6 space-y-3`}>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Question reference{" "}
              <span className={numericMono}>{year} — Q{selectedQuestion.question_number}</span>
            </p>

            {selectedQuestion.diagram_required && (
              <div className="rounded-xl border border-amber-800 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
                ⚠️ This question includes a diagram. Refer to your question paper for the figure.
              </div>
            )}

            {selectedQuestion.question_text?.trim() ? (
              <p className="text-sm leading-relaxed text-foreground/90">{selectedQuestion.question_text}</p>
            ) : (
              <p className="text-sm italic leading-relaxed text-muted-foreground">
                Question text not yet available. Refer to your physical question paper.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Answer input */}
      {selectedQuestion && (
        <div className={`${cardPadded} mt-6`}>
          <h2 className={sectionLabel}>Your answer</h2>
          <div className="mt-6 flex flex-col gap-6">

            {/* MCQ */}
            {!selectedQuestion.is_subjective && selectedQuestion.question_type === "mcq" && selectedQuestion.options?.length ? (
              <div className="flex flex-col gap-3">
                <label className="text-xs font-medium text-muted-foreground">Select the correct option</label>
                <div className="space-y-2">
                  {selectedQuestion.options.map((opt, i) => (
                    <label
                      key={i}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors ${
                        studentAnswer === opt
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border bg-card text-foreground/90 hover:bg-border/40"
                      }`}
                    >
                      <input type="radio" name="mcq_answer" value={opt} checked={studentAnswer === opt} onChange={(e) => setStudentAnswer(e.target.value)} className="sr-only" />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>

            /* True / False */
            ) : !selectedQuestion.is_subjective && selectedQuestion.question_type === "true_false" ? (
              <div className="flex flex-col gap-3">
                <label className="text-xs font-medium text-muted-foreground">Select True or False</label>
                <div className="flex gap-3">
                  {["True", "False"].map((opt) => (
                    <button
                      key={opt} type="button" onClick={() => setStudentAnswer(opt)}
                      className={`flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                        studentAnswer === opt ? "border-accent bg-accent/10 text-accent" : "border-border bg-card text-foreground/90 hover:bg-border/40"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

            /* Fill-blank / match */
            ) : !selectedQuestion.is_subjective ? (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-muted-foreground">
                  {selectedQuestion.question_type === "match" ? "Enter your answer as: A-1, B-2, C-3, D-4" : "Enter your answer"}
                </label>
                <input
                  type="text" value={studentAnswer} onChange={(e) => setStudentAnswer(e.target.value)}
                  placeholder={selectedQuestion.question_type === "match" ? "e.g. A-3, B-1, C-4, D-2" : "Type your answer…"}
                  className={`${inputBase} h-10 w-full px-3`}
                />
              </div>

            /* Subjective */
            ) : (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-muted-foreground">Write your answer</label>
                <textarea
                  value={studentAnswer} onChange={(e) => setStudentAnswer(e.target.value)} rows={8}
                  disabled={!selectedQuestion.question_text?.trim()}
                  placeholder={selectedQuestion.question_text?.trim() ? "Write your detailed answer here…" : "Question text not available — evaluation unavailable until added."}
                  className={textareaClass}
                />
              </div>
            )}

            <button onClick={handleSubmit} disabled={!canSubmit} className={btnPrimary}>
              {evaluating ? "Evaluating…" : "Evaluate"}
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-6 space-y-4">
          <div className={errorAlert}>{error}</div>
          {limitReached && (
            <div className={cardPadded}>
              {feedbackSent ? (
                <p className="text-sm text-emerald-400">Thanks — we&apos;ll take a look.</p>
              ) : (
                <div className="flex flex-col gap-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    Help us prioritise — why do you need more evaluations today?
                  </p>
                  <textarea value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} placeholder="E.g., exam prep, testing different approaches…" rows={2} className={textareaClass} />
                  <button
                    onClick={async () => {
                      if (!feedbackText.trim()) return;
                      try {
                        const res = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: feedbackText }) });
                        if (res.ok) setFeedbackSent(true);
                      } catch (err) { console.error("Feedback send failed:", err); }
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

      {/* Result */}
      {result && (
        <div className={`${cardPadded} mt-6`}>
          <div className="mb-8 flex items-center justify-between gap-4">
            <h2 className={sectionLabel}>{result.is_objective ? "Result" : "Examiner feedback"}</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                <span className={numericMono}>{result.token_cost}</span> token{result.token_cost !== 1 ? "s" : ""} used ·{" "}
                <span className={numericMono}>{result.tokens_remaining}</span> remaining
              </span>
              <span className={scoreBadgeClass(result.marks_awarded, result.total_marks)}>
                {result.marks_awarded} / {result.total_marks}
              </span>
            </div>
          </div>

          <div className="space-y-8">

            {/* Objective */}
            {result.is_objective ? (
              <div className={`rounded-xl border px-5 py-4 ${result.is_correct ? "border-emerald-800 bg-emerald-950/30" : "border-red-800 bg-red-950/30"}`}>
                <p className={`text-sm font-medium ${result.is_correct ? "text-emerald-300" : "text-red-300"}`}>
                  {result.is_correct ? "✓ Correct" : "✗ Incorrect"}
                </p>
                {!result.is_correct && result.correct_answer && (
                  <p className="mt-2 text-sm text-foreground/90">
                    Correct answer: <span className="font-medium">{result.correct_answer}</span>
                  </p>
                )}
              </div>

            /* Subjective */
            ) : (
              <>
                {/* Examiner feedback quote */}
                <div className={mutedPanel}>
                  <p className="text-sm italic leading-relaxed text-foreground/90">&ldquo;{result.examiner_feedback}&rdquo;</p>
                </div>

                {/* Points awarded */}
                <Section title="Points awarded" items={result.points_hit} color="text-emerald-400" />

                {/* Points missed */}
                <Section title="Points missed" items={result.points_missed} color="text-red-400" />

                {/* Conceptual errors — premium */}
                <PremiumGate label="Conceptual errors" unlocked={premiumUnlocked} variant="conceptual">
                  <Section title="Conceptual errors" items={result.conceptual_errors} color="text-amber-400" />
                </PremiumGate>

                {/* Model answer — premium */}
                <PremiumGate label="Model answer" unlocked={premiumUnlocked} variant="model">
                  <div>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className={sectionLabel}>Model answer</span>
                      <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
                        {result.model_answer_source === "verified" ? "CISCE verified" : "AI generated"}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-foreground/90">{result.model_answer}</p>
                  </div>
                </PremiumGate>

                {/* Improvement tips — premium, ordered list */}
                <PremiumGate label="Improvement tips" unlocked={premiumUnlocked} variant="tips">
                  <div>
                    <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-purple-400">
                      How to improve
                    </div>
                    <ul className="space-y-3">
                      {result.improvement_tips.map((tip, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-premium/10 font-mono text-xs font-bold text-purple-400">
                            {i + 1}
                          </span>
                          <span className="text-sm leading-relaxed text-foreground/90">{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </PremiumGate>

                {/* Global upgrade CTA */}
                <WaitlistCapture unlocked={premiumUnlocked} onUnlock={() => setPremiumUnlocked(true)} />
              </>
            )}

            {/* Eval quality feedback */}
            <div className="border-t border-border pt-6">
              {evalFeedbackStatus === "success" ? (
                <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-950/30 py-4 text-sm font-medium text-emerald-400">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Thank you! Your feedback helps improve the AI.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-foreground">Was this evaluation accurate?</h3>
                    <div className="flex gap-2">
                      {(["up", "down"] as const).map((r) => (
                        <button
                          key={r} onClick={() => setEvalRating(r)}
                          className={`rounded-lg border px-3 py-1.5 transition-colors ${
                            evalRating === r ? "border-accent bg-accent/10 text-accent" : "border-border bg-card text-muted-foreground hover:bg-border/40"
                          }`}
                        >
                          {r === "up" ? "👍" : "👎"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {evalRating && (
                    <div className="flex flex-col gap-3">
                      <textarea
                        value={evalFeedbackText} onChange={(e) => setEvalFeedbackText(e.target.value)}
                        placeholder="What did the AI get right or wrong?"
                        className={`${textareaClass} resize-none`} rows={2}
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-red-400">
                          {evalFeedbackStatus === "error" && "Something went wrong. Try again."}
                        </span>
                        <button
                          onClick={handleEvalFeedbackSubmit}
                          disabled={evalFeedbackText.trim().length < 3 || evalFeedbackStatus === "submitting"}
                          className="rounded-lg bg-foreground px-4 py-2 text-xs font-medium text-background transition-colors hover:opacity-90 disabled:opacity-50"
                        >
                          {evalFeedbackStatus === "submitting" ? "Sending…" : "Submit feedback"}
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