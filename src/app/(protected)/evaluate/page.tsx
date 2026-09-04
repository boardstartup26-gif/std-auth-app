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
  figCaption,
  figPlate,
  figTool,
  inputBase,
  numericMono,
  pageShellWide,
  scoreBadgeClass,
  sectionLabel,
  selectorLabel,
  selectorStrip,
  sheet,
  sheetBody,
  sheetFoot,
  sheetQuestionText,
  sheetTop,
  tokenCountClass,
} from "@/lib/ui";
import { WEEKLY_TOKEN_LIMIT, TOKEN_COST_SUBJECTIVE, TOKEN_COST_OBJECTIVE } from "@/lib/constants";

// ─── Types ────────────────────────────────────────────────────────────────────

// Two import batches shaped MCQ options differently: chemistry/physics/
// biology/geography store plain option strings; history & civics / english
// literature store {key, text} objects (their correct_answer is the bare
// key letter). Both shapes have to render and submit correctly.
type McqOption = string | { key: string; text: string };

interface Question {
  id: string;
  question_number: string;
  question_text: string;
  is_subjective: boolean;
  question_type: string | null;
  options: McqOption[] | null;
  paper: string;
  diagram_required: boolean | null;
  diagram_url: string | null;
  diagram_source: DiagramSource;
  topic: string | null;
  // Marks come from the question_marks view, not marking_schemes directly —
  // that table now only opens to a student who has already attempted the
  // question, so the answer key can't be read ahead of time. The view carries
  // total_marks and nothing else. Supabase types an embedded relation as an
  // array even where it is 1:1, hence the union.
  question_marks: { total_marks: number | null }[] | { total_marks: number | null } | null;
}

// Why a question is diagram-related. Set by scripts/sync_diagram_figures.mjs;
// see the migration that adds questions.diagram_source for the full contract.
type DiagramSource = "figure" | "physical_map" | "ocr_pending" | null;

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
  { name: "Chemistry",           available: true },
  { name: "Physics",             available: true },
  { name: "Biology",             available: true },
  { name: "Geography",           available: true },
  { name: "History & Civics",    available: true },
  { name: "English Literature",  available: true },
];

// The submitted value must match how correct_answer is stored for that
// question: full option text for chemistry/physics/biology/geography, bare
// key letter for history & civics/english literature.
function mcqOptionValue(opt: McqOption): string {
  return typeof opt === "string" ? opt : opt.key;
}
function mcqOptionLabel(opt: McqOption): string {
  return typeof opt === "string" ? opt : opt.text;
}

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

// Only the remaining count is coloured. The per-question cost beside it stays
// neutral, so the colour always answers "how much do I have left", never
// "what does this cost". Bands are absolute, not proportional: 13+ / 7–12 / <7.
function TokenBadge({ tokensRemaining, tokenCost }: { tokensRemaining: number; tokenCost: number }) {
  return (
    <p className="m-0 text-center font-mono text-[10px] font-semibold text-muted-foreground">
      <span className={tokenCountClass(tokensRemaining)}>{tokensRemaining}</span>
      {" "}token{tokensRemaining !== 1 ? "s" : ""} left this week
      {tokenCost > 0 && (
        <> · costs <span className="font-semibold text-foreground">{tokenCost}</span></>
      )}
    </p>
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

// Every question_type value that actually occurs in the data (per the
// `questions_question_type_check` DB constraint) must map to exactly one
// bucket here. Falling through to a shared default label was the bug: it
// silently merged unrelated types (fill_in_blank, diagram, long_answer)
// under one "Objective" label while keeping them as separate dropdown
// values — producing duplicate-looking "Objective" entries and hiding
// genuinely subjective long_answer questions inside them.
const QUESTION_TYPE_LABELS: Record<string, string> = {
  subjective: "Subjective (written)",
  mcq: "MCQ",
  true_false: "True / False",
  fill_in_blank: "Fill in the blank",
  match: "Match the following",
  short_answer: "Short answer",
  diagram: "Diagram / drawing",
  objective: "Objective",
};

function questionTypeLabel(category: string): string {
  return QUESTION_TYPE_LABELS[category] ?? category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Categorise strictly by question_type when it's set — is_subjective is only
// a fallback for questions with no explicit type. Some "match the following"
// / "name the following" style questions are mistakenly flagged
// is_subjective: true in the source data; trusting is_subjective first would
// lump them into the generic "Subjective (written)" bucket and lose their
// real answer widget (match/fill-blank input instead of a free-text box).
// long_answer is the one exception: it's always free-text and Claude-graded
// exactly like "subjective", so it's merged into that bucket rather than
// getting its own near-duplicate "Long answer" entry.
function questionCategory(q: Question): string {
  if (q.question_type === "long_answer") return "subjective";
  return q.question_type ?? (q.is_subjective ? "subjective" : "objective");
}

// How a question's figure affects answering. Three of the four states are
// answerable — only a question asking the student to DRAW is truly blocked,
// plus the residue of questions whose figure hasn't been captured yet.
//
//   "ok"          nothing in the way (with or without a figure to display)
//   "map"         needs a Survey of India topographic sheet we can't ship
//   "ocr"         student must draw; blocked until handwriting recognition
//   "no-figure"   needs a figure that hasn't been sourced yet; blocked
type DiagramState = "ok" | "map" | "ocr" | "no-figure";

function diagramState(q: Question): DiagramState {
  // Drawing beats everything: even where a figure exists for context, the
  // answer itself is a drawing we can't grade yet.
  if (q.diagram_source === "ocr_pending" || q.question_type === "diagram") return "ocr";
  if (q.diagram_source === "physical_map") return "map";
  if (q.diagram_required && !q.diagram_url) return "no-figure";
  return "ok";
}

function isDiagramBlocked(q: Question): boolean {
  const s = diagramState(q);
  return s === "ocr" || s === "no-figure";
}

// Is there a figure to be wrong about? A plain text question has nothing to
// report, so offering "Figure wrong or missing?" there is noise at best and
// invites junk reports at worst.
function hasFigureContext(q: Question): boolean {
  return Boolean(q.diagram_url) || q.diagram_source !== null || Boolean(q.diagram_required);
}

function totalMarksOf(q: Question): number | null {
  const ms = q.question_marks;
  if (!ms) return null;
  const row = Array.isArray(ms) ? ms[0] : ms;
  return row?.total_marks ?? null;
}

// ─── Question sheet ───────────────────────────────────────────────────────────

// The figure at full size, over the page. Crops are imperfect at the edges —
// rather than chase perfection, every figure gets a way to be looked at
// properly.
function FigureViewer({ src, label, onClose }: { src: string; label: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    // The page behind must not scroll while the viewer owns the screen.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col gap-3 bg-black/95 p-4 sm:p-8"
    >
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs font-semibold text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded border border-border px-3 py-1.5 font-mono text-xs font-bold text-foreground transition-colors hover:border-cursor hover:text-cursor"
        >
          Close ✕
        </button>
      </div>
      {/* Stop propagation so clicking the image itself doesn't dismiss. */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={label}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded-lg bg-white object-contain"
        />
      </div>
    </div>
  );
}

function FigureSlot({ q, onZoom }: { q: Question; onZoom: () => void }) {
  const state = diagramState(q);

  if (q.diagram_url) {
    return (
      <figure className="m-0 flex flex-col gap-2">
        <div className={figPlate}>
          <div className="absolute right-2 top-2 z-10">
            <button type="button" onClick={onZoom} className={figTool}>⤢ Zoom</button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={q.diagram_url}
            alt={`Figure for Q${q.question_number}`}
            onClick={onZoom}
            className="max-h-[260px] w-auto max-w-full cursor-zoom-in"
          />
        </div>
        <figcaption className={figCaption}>
          <span>Figure — Q{q.question_number}</span>
          <span className="inline-flex items-center gap-1.5 text-[#2F6B3D] before:block before:h-[5px] before:w-[5px] before:rounded-full before:bg-[#2F8A46]">
            From question paper
          </span>
        </figcaption>
      </figure>
    );
  }

  // No image, and an honest reason why. Never a silent blank.
  if (state === "map") {
    return (
      <div className={`${figPlate} min-h-[88px]`}>
        <p className="m-0 max-w-[280px] text-center font-mono text-[10px] leading-relaxed text-paper-ink-soft">
          <span className="font-semibold text-paper-ink">Survey of India map extract</span>
          <br />
          These sheets aren&apos;t ours to reproduce. Refer to your
          <br />
          physical map, then answer below.
        </p>
      </div>
    );
  }

  if (q.diagram_required) {
    return (
      <div className={`${figPlate} min-h-[88px]`}>
        <p className="m-0 max-w-[240px] text-center font-mono text-[10px] leading-relaxed text-paper-ink-soft">
          Figure not available yet
          <br />
          <span className="text-[#8A8878]">Refer to your printed paper.</span>
        </p>
      </div>
    );
  }

  return null;
}

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
  const [tokensRemaining,   setTokensRemaining]   = useState<number>(WEEKLY_TOKEN_LIMIT);
  const [limitReached,      setLimitReached]      = useState(false);
  const [feedbackText,      setFeedbackText]      = useState("");
  const [feedbackSent,      setFeedbackSent]      = useState(false);
  const questionOpenedAt = useRef<number | null>(null);
  const [evalRating,        setEvalRating]        = useState<"up" | "down" | null>(null);
  const [evalFeedbackText,  setEvalFeedbackText]  = useState("");
  const [evalFeedbackStatus, setEvalFeedbackStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [zoomedFigure,      setZoomedFigure]      = useState<string | null>(null);
  const [reportOpen,        setReportOpen]        = useState(false);
  const [reportText,        setReportText]        = useState("");
  const [reportSent,        setReportSent]        = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

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
          setTokensRemaining(data.tokens_remaining ?? WEEKLY_TOKEN_LIMIT);
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
        .select("id, question_number, question_text, is_subjective, question_type, options, paper, diagram_required, diagram_url, diagram_source, topic, question_marks(total_marks)")
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
    // Reset the figure-report form, or a report typed for one question would
    // carry over — and worse, "Thanks, we'll review" would still be showing
    // against a different figure.
    setReportOpen(false); setReportText(""); setReportSent(false); setZoomedFigure(null);
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
        body: JSON.stringify({ question_number: questionNumber, year: Number(year), paper: selectedQuestion?.paper ?? "1", subject, student_answer: studentAnswer }),
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

  // Figure reports reuse /api/feedback rather than adding a table — the
  // volume is low and what matters is that a wrong figure reaches us at all.
  // The question is identified in the message body so it can be acted on.
  async function handleReportFigure() {
    if (!reportText.trim() || !selectedQuestion) return;
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `[FIGURE REPORT] ${subject} ${year} Q${selectedQuestion.question_number} `
            + `(source=${selectedQuestion.diagram_source ?? "none"}, url=${selectedQuestion.diagram_url ?? "none"}): `
            + reportText.trim(),
        }),
      });
      if (res.ok) setReportSent(true);
    } catch (err) {
      console.error("[BoardEdge] figure report failed:", err);
    }
  }

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
      const key = questionCategory(q);
      if (!seen.has(key)) {
        seen.add(key);
        types.push({ value: key, label: questionTypeLabel(key) });
      }
    }
    return types;
  })();

  const filteredQuestions = questionType
    ? questions.filter((q) => questionCategory(q) === questionType)
    : [];

  const tokenCost = selectedQuestion
    ? (selectedQuestion.is_subjective || selectedQuestion.question_type === "short_answer"
        ? TOKEN_COST_SUBJECTIVE
        : TOKEN_COST_OBJECTIVE)
    : 0;
  const canSubmit = Boolean(
    subject && year && questionType && questionNumber && studentAnswer.trim() &&
    !evaluating && !(selectedQuestion && isDiagramBlocked(selectedQuestion))
  );

  // ─── Auth gate ────────────────────────────────────────────────────────────

  if (!authChecked) {
    return <div className={`${pageShellWide} text-sm text-muted-foreground`}>Checking session…</div>;
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={pageShellWide}>

      {zoomedFigure && selectedQuestion && (
        <FigureViewer
          src={zoomedFigure}
          label={`Figure — ${subject} ${year} Q${selectedQuestion.question_number}`}
          onClose={() => setZoomedFigure(null)}
        />
      )}

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-6">
        <div>
          <p className={sectionLabel}>Evaluation engine</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">New evaluation</h1>
        </div>
        <Link href="/dashboard" className={backLink}>← Dashboard</Link>
      </div>

      {/* Selector strip. Four stacked dropdowns in a tall left card cost more
          vertical space than the figure they pushed off screen, so they
          collapse to one horizontal row above the sheet. */}
      <div className={`${selectorStrip} mb-4`}>
        <div className="flex min-w-0 flex-col gap-1">
          <span className={selectorLabel}>Subject</span>
          <select value={subject} onChange={(e) => setSubject(e.target.value)} className={selectClass}>
            <option value="">Select</option>
            {SUBJECTS.map((s) => (
              <option key={s.name} value={s.name} disabled={!s.available}>
                {s.name}{!s.available ? " — Coming soon" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <span className={selectorLabel}>Year</span>
          <select
            value={year}
            onChange={(e) => {
              setYear(e.target.value ? Number(e.target.value) : "");
              setQuestionType(""); setQuestionNumber(""); setSelectedQuestion(null);
            }}
            disabled={!subject || loadingYears}
            className={selectClass}
          >
            <option value="">{loadingYears ? "Loading…" : "Year"}</option>
            {years.map((y) => (
              <option key={y} value={y} className={numericMono}>{y}</option>
            ))}
          </select>
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <span className={selectorLabel}>Type</span>
          <select
            value={questionType}
            onChange={(e) => { setQuestionType(e.target.value); setQuestionNumber(""); setSelectedQuestion(null); }}
            disabled={!year || loadingQuestions || !questionTypes.length}
            className={selectClass}
          >
            <option value="">{loadingQuestions ? "Loading…" : !year ? "Year first" : "Type"}</option>
            {questionTypes.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {questionType && (
          <div className="flex min-w-[180px] flex-1 flex-col gap-1">
            <span className={selectorLabel}>Question</span>
            <QuestionDropdown
              questions={filteredQuestions}
              value={questionNumber}
              onChange={setQuestionNumber}
              disabled={!filteredQuestions.length}
            />
          </div>
        )}
      </div>

      {!selectedQuestion && (
        <div className={`${cardPadded} text-sm leading-relaxed text-muted-foreground`}>
          Pick a subject, year, type and question above to begin.
        </div>
      )}

      {/* Sheet on the left, answer on the right. The sheet is wider — it holds
          the question and its figure, which is what the student reads. */}
      <div className="grid gap-4 lg:grid-cols-[1.32fr_1fr] lg:items-start">

        {/* ── The paper sheet ── */}
        {selectedQuestion && (
          <div className={sheet}>
            <div className={sheetTop}>
              <span className="font-mono text-xs font-medium tracking-tight text-paper-ink">
                Q{selectedQuestion.question_number}
              </span>
              {selectedQuestion.topic && (
                <span className="font-mono text-[10px] tracking-wide text-paper-ink-soft">
                  {selectedQuestion.topic}
                </span>
              )}
              {totalMarksOf(selectedQuestion) != null && (
                <span className="ml-auto whitespace-nowrap rounded border border-[#BDBBAD] bg-paper px-2 py-0.5 font-mono text-[11px] font-semibold text-[#33322B]">
                  {totalMarksOf(selectedQuestion)} mark{totalMarksOf(selectedQuestion) === 1 ? "" : "s"}
                </span>
              )}
            </div>

            <div className={sheetBody}>
              {selectedQuestion.question_text?.trim() ? (
                <p className={sheetQuestionText}>{selectedQuestion.question_text}</p>
              ) : (
                <p className="m-0 text-sm italic leading-relaxed text-paper-ink-soft">
                  Question text not yet available. Refer to your physical question paper.
                </p>
              )}

              <FigureSlot
                q={selectedQuestion}
                onZoom={() => selectedQuestion.diagram_url && setZoomedFigure(selectedQuestion.diagram_url)}
              />
            </div>

            <div className={sheetFoot}>
              {hasFigureContext(selectedQuestion) && (
                <span className="font-bold text-[#383730]">
                  Figure wrong or missing?{" "}
                  <button
                    type="button"
                    onClick={() => setReportOpen((v) => !v)}
                    className="underline decoration-1 underline-offset-2 transition-colors hover:text-cursor"
                  >
                    Report it
                  </button>
                </span>
              )}
              <span className="ml-auto">
                ICSE {subject} · {year}
              </span>
            </div>

            {/* A student flagging a bad crop or a leaked answer is the only QA
                loop that scales past manual re-audit of every figure. */}
            {reportOpen && hasFigureContext(selectedQuestion) && (
              <div className="border-t border-paper-rule bg-paper-foot px-4 py-3">
                {reportSent ? (
                  <p className="m-0 font-mono text-[10px] text-[#2F6B3D]">
                    Thanks — we&apos;ll review this figure.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={reportText}
                      onChange={(e) => setReportText(e.target.value)}
                      rows={2}
                      placeholder="What's wrong? e.g. cut off, wrong figure, shows the answer…"
                      className="w-full rounded border border-paper-rule bg-white px-2.5 py-2 text-xs text-paper-ink outline-none focus:border-cursor"
                    />
                    <button
                      type="button"
                      onClick={handleReportFigure}
                      disabled={!reportText.trim()}
                      className="self-start rounded border border-[#BDBBAD] bg-white px-3 py-1.5 font-mono text-[10px] font-bold text-[#2F2E28] transition-colors hover:border-cursor disabled:opacity-40"
                    >
                      Send report
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Right column — answer + results */}
        <div className="flex flex-col gap-4">

          {/* Answer input */}
          {selectedQuestion && (
            <div className={cardPadded}>
              <h2 className={sectionLabel}>Your answer</h2>

              {isDiagramBlocked(selectedQuestion) ? (
                <div className="mt-6 rounded-xl border border-border bg-card/60 px-4 py-4 text-sm leading-relaxed text-muted-foreground">
                  {diagramState(selectedQuestion) === "ocr" ? (
                    <>
                      This question asks you to <span className="font-semibold text-foreground/90">draw</span>, and
                      grading a drawing needs handwriting recognition — which isn&apos;t built yet.
                      For now, try a written question from the same paper.
                    </>
                  ) : (
                    <>
                      We haven&apos;t sourced the figure for this question yet, so it can&apos;t be graded fairly.
                      For now, try another question from the same paper.
                    </>
                  )}
                </div>
              ) : (
              <div className="mt-6 flex flex-col gap-6">

                {/* MCQ */}
                {selectedQuestion.question_type === "mcq" && selectedQuestion.options?.length ? (
                  <div className="flex flex-col gap-3">
                    <label className="text-xs font-medium text-muted-foreground">Select the correct option</label>
                    <div className="space-y-2">
                      {selectedQuestion.options.map((opt, i) => {
                        const value = mcqOptionValue(opt);
                        const label = mcqOptionLabel(opt);
                        return (
                        <label
                          key={i}
                          className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors ${
                            studentAnswer === value
                              ? "border-accent bg-accent/10 text-accent"
                              : "border-border bg-card text-foreground/90 hover:bg-border/40"
                          }`}
                        >
                          <input type="radio" name="mcq_answer" value={value} checked={studentAnswer === value} onChange={(e) => setStudentAnswer(e.target.value)} className="sr-only" />
                          {label}
                        </label>
                        );
                      })}
                    </div>
                  </div>

                /* True / False */
                ) : selectedQuestion.question_type === "true_false" ? (
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

                /* Fill-blank / match / plain objective (no specific type) */
                ) : selectedQuestion.question_type === "fill_in_blank" ||
                    selectedQuestion.question_type === "match" ||
                    (!selectedQuestion.question_type && !selectedQuestion.is_subjective) ? (
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
                <TokenBadge tokensRemaining={tokensRemaining} tokenCost={tokenCost} />
                {evaluating && (
                  <p className="text-center text-xs text-muted-foreground">
                    {NON_OCR_LOADING_MESSAGES[loadingMessageIndex]}
                  </p>
                )}
                {/* The evaluation renders full-width below the fold, so without
                    this the page looks like nothing happened on submit. */}
                {result && !evaluating && (
                  <button
                    type="button"
                    onClick={() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    className="text-center text-xs font-semibold text-accent underline decoration-1 underline-offset-2 transition-colors hover:text-accent-hover"
                  >
                    ↓ Scroll down to see your evaluation
                  </button>
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

        </div>
      </div>

      {/* Result — full width, below the split. The paired points-hit /
          points-missed grid needs the whole page; inside the answer column it
          collapsed into one cramped stack hugging the right edge. */}
      {result && (
        <div ref={resultRef} className={`${cardPadded} mt-6 scroll-mt-6`}>
              <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-col items-start gap-2">
                  <span className={scoreBadgeClass(result.marks_awarded, result.total_marks, "xl")}>
                    {result.marks_awarded} / {result.total_marks}
                  </span>
                  <h2 className={sectionLabel}>{result.is_objective ? "Result" : "Examiner feedback"}</h2>
                </div>
                <span className="text-xs text-muted-foreground">
                  <span className={numericMono}>{result.token_cost}</span> token{result.token_cost !== 1 ? "s" : ""} used ·{" "}
                  <span className={numericMono}>{result.tokens_remaining}</span> remaining
                </span>
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
  );
}
