"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
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

const NON_OCR_LOADING_MESSAGES = [
  "Analyzing text structure…",
  "Hunting for those precious keywords…",
  "Evaluating conceptual clarity and depth…",
  "Finalizing your score…",
];

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
  const color = pct > 50 ? "text-status-correct" : pct > 20 ? "text-status-partial" : "text-status-wrong";

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
      <span className={`${numericMono} ${color}`}>{tokensRemaining}</span>
      <span className={color}>token{tokensRemaining !== 1 ? "s" : ""} remaining today</span>
      {tokenCost > 0 && (
        <span className="text-muted-foreground">
          · this question costs <span className={numericMono}>{tokenCost}</span>
        </span>
      )}
    </div>
  );
}

// Custom dropdown — a native <select> clips/truncates long option text with no
// way to show it in full, so the question picker needs its own scrollable
// listbox to satisfy "show the full question text, don't slice it."
function QuestionDropdown({
  questions,
  value,
  onChange,
  disabled,
}: {
  questions: Question[];
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selected = questions.find((q) => q.question_number === value) ?? null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`${inputBase} flex w-full items-start justify-between gap-3 py-2.5 text-left disabled:opacity-50`}
      >
        <span className={`line-clamp-2 text-sm ${selected ? "text-foreground" : "text-muted-foreground"}`}>
          {selected
            ? `Q${selected.question_number}${selected.question_text?.trim() ? ` — ${selected.question_text}` : ""}`
            : questions.length
              ? "Select question"
              : "No questions available"}
        </span>
        <ChevronDown
          size={16}
          className={`mt-0.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && questions.length > 0 && (
        <div className="absolute z-20 mt-2 max-h-80 w-full overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
          {questions.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => { onChange(q.question_number); setOpen(false); }}
              className={`block w-full border-b border-border/60 px-3 py-2.5 text-left text-sm leading-relaxed transition-colors last:border-b-0 hover:bg-surface-raised ${
                q.question_number === value ? "bg-accent-subtle text-accent" : "text-foreground/90"
              }`}
            >
              <span className={numericMono}>Q{q.question_number}</span>
              {q.question_text?.trim() ? ` — ${q.question_text}` : ""}
            </button>
          ))}
        </div>
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
  const [tokensRemaining,   setTokensRemaining]   = useState<number>(DAILY_TOKEN_LIMIT);
  const [limitReached,      setLimitReached]      = useState(false);
  const [feedbackText,      setFeedbackText]      = useState("");
  const [feedbackSent,      setFeedbackSent]      = useState(false);
  const questionOpenedAt = useRef<number | null>(null);
  const [evalRating,        setEvalRating]        = useState<"up" | "down" | null>(null);
  const [evalFeedbackText,  setEvalFeedbackText]  = useState("");
  const [evalFeedbackStatus, setEvalFeedbackStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

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
        // FIX: diagram_required was missing here — selectedQuestion.diagram_required
        // was always undefined, so the diagram-blocking UI never triggered.
        .select("id, question_number, question_text, is_subjective, question_type, options, diagram_required")
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

  // ─── Loading message rotation (non-OCR path only — no upload path exists yet) ─

  useEffect(() => {
    if (!evaluating) { setLoadingMessageIndex(0); return; }
    const interval = setInterval(() => {
      setLoadingMessageIndex((i) => Math.min(i + 1, NON_OCR_LOADING_MESSAGES.length - 1));
    }, 2500);
    return () => clearInterval(interval);
  }, [evaluating]);

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
  const canSubmit = Boolean(
    subject && year && questionType && questionNumber && studentAnswer.trim() &&
    !evaluating && !selectedQuestion?.diagram_required
  );

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

      {/* Two-column layout: selectors left, answer + results right — per §3 reference layout */}
      <div className="grid gap-6 lg:grid-cols-[380px_1fr] lg:items-start">

        {/* Left column — question selector */}
        <div className="lg:sticky lg:top-6">
          <div className={cardPadded}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className={sectionLabel}>Select question</h2>
            </div>
            <div className="mt-2">
              <TokenBadge tokensRemaining={tokensRemaining} tokenCost={tokenCost} />
            </div>

            <div className="mt-6 flex flex-col gap-4">
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

              {/* Question — appears once type is selected */}
              {questionType && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-muted-foreground">Question</label>
                  <QuestionDropdown
                    questions={filteredQuestions}
                    value={questionNumber}
                    onChange={setQuestionNumber}
                    disabled={!filteredQuestions.length}
                  />
                </div>
              )}
            </div>

            {/* Question reference panel */}
            {selectedQuestion && (
              <div className={`${mutedPanel} mt-6 space-y-3`}>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Question reference{" "}
                  <span className={numericMono}>{year} — Q{selectedQuestion.question_number}</span>
                </p>

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
        </div>

        {/* Right column — answer + results */}
        <div className="flex flex-col gap-6">

          {/* Answer input */}
          {selectedQuestion && (
            <div className={cardPadded}>
              <h2 className={sectionLabel}>Your answer</h2>

              {selectedQuestion.diagram_required ? (
                <div className="mt-6 rounded-xl border border-border bg-card/60 px-4 py-4 text-sm leading-relaxed text-muted-foreground">
                  Diagram-based questions aren&apos;t available for evaluation yet — but they will be soon.
                  For now, try a text-based question from the same paper.
                </div>
              ) : (
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
                {evaluating && (
                  <p className="text-center text-xs text-muted-foreground">
                    {NON_OCR_LOADING_MESSAGES[loadingMessageIndex]}
                  </p>
                )}
              </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="space-y-4">
              <div className={errorAlert}>{error}</div>
              {limitReached && (
                <div className={cardPadded}>
                  {feedbackSent ? (
                    <p className="text-sm text-status-correct">Thanks — we&apos;ll take a look.</p>
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
            <div className={cardPadded}>
              <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
                <h2 className={sectionLabel}>{result.is_objective ? "Result" : "Examiner feedback"}</h2>
                <div className="flex flex-wrap items-center gap-3">
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
                  <div className={`rounded-xl border px-5 py-4 ${result.is_correct ? "border-status-correct bg-status-correct-subtle" : "border-status-wrong bg-status-wrong-subtle"}`}>
                    <p className={`text-sm font-medium ${result.is_correct ? "text-status-correct" : "text-status-wrong"}`}>
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
                    <div className="rounded-xl border border-tag-examiner-feedback bg-tag-examiner-feedback-subtle p-5">
                      <p className="text-sm italic leading-relaxed text-foreground/90">&ldquo;{result.examiner_feedback}&rdquo;</p>
                    </div>

                    {/* Points hit / Points missed — paired grid per §3 reference layout */}
                    <div className="grid gap-6 sm:grid-cols-2">
                      <Section title="Points awarded" items={result.points_hit} color="text-status-correct" />
                      <Section title="Points missed" items={result.points_missed} color="text-status-wrong" />
                    </div>

                    {/* Conceptual errors */}
                    {result.conceptual_errors.length > 0 && (
                      <div className="rounded-xl border border-tag-conceptual bg-tag-conceptual-subtle p-5">
                        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-tag-conceptual">
                          Conceptual errors
                        </div>
                        <ul className="space-y-2">
                          {result.conceptual_errors.map((item, i) => (
                            <li key={i} className="text-sm leading-relaxed text-foreground/90">— {item}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Model answer */}
                    <div className="rounded-xl border border-tag-model-answer bg-tag-model-answer-subtle p-5">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-widest text-tag-model-answer">Model answer</span>
                        <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
                          {result.model_answer_source === "verified" ? "CISCE verified" : "AI generated"}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-foreground/90">{result.model_answer}</p>
                    </div>

                    {/* Improvement tips — ordered list */}
                    <div className="rounded-xl border border-tag-improvement-tips bg-tag-improvement-tips-subtle p-5">
                      <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-tag-improvement-tips">
                        How to improve
                      </div>
                      <ul className="space-y-3">
                        {result.improvement_tips.map((tip, i) => (
                          <li key={i} className="flex items-start gap-3">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-tag-improvement-tips-subtle font-mono text-xs font-bold text-tag-improvement-tips">
                              {i + 1}
                            </span>
                            <span className="text-sm leading-relaxed text-foreground/90">{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}

                {/* Eval quality feedback */}
                <div className="border-t border-border pt-6">
                  {evalFeedbackStatus === "success" ? (
                    <div className="flex items-center justify-center gap-2 rounded-xl bg-status-correct-subtle py-4 text-sm font-medium text-status-correct">
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
                            <span className="text-xs text-status-wrong">
                              {evalFeedbackStatus === "error" && "Something went wrong. Try again."}
                            </span>
                            <button
                              onClick={handleEvalFeedbackSubmit}
                              disabled={evalFeedbackText.trim().length < 3 || evalFeedbackStatus === "submitting"}
                              className="rounded-lg bg-accent px-4 py-2 text-xs font-medium text-background transition-colors hover:bg-accent-hover disabled:opacity-50"
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
      </div>
    </div>
  );
}
