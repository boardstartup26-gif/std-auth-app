"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  btnPrimary,
  cardPadded,
  contextBlockquote,
  contextExtractText,
  contextItalic,
  contextItem,
  contextMeta,
  contextSource,
  contextTable,
  contextWrapper,
  errorAlert,
  figCaption,
  figPlate,
  figTool,
  inputBase,
  numericFigures,
  pageShellWide,
  scoreBadgeClass,
  sectionLabel,
  sheet,
  sheetBody,
  sheetFoot,
  sheetQuestionText,
  sheetTop,
  creditCountClass,
} from "@/lib/ui";
import { WEEKLY_CREDIT_LIMIT, CREDIT_COST_SUBJECTIVE, CREDIT_COST_OBJECTIVE } from "@/lib/constants";
import { EVENTS, FAILURE_STAGES } from "@/lib/analytics/events";
import { track } from "@/lib/analytics/track";
import { isSubjectiveGraded } from "@/lib/question-format";
import { QuestionPicker } from "./_components/QuestionPicker";
import {
  diagramState,
  hasFigureContext,
  isDiagramBlocked,
  mcqOptionLabel,
  mcqOptionValue,
  QUESTION_SELECT,
  SUBJECTS,
  totalMarksOf,
  type Question,
  type StimulusData,
  type TableData,
} from "./_lib/question";

// ─── Feedback issue tags ──────────────────────────────────────────
// Fixed vocabulary, mirrored by the allowlist in /api/feedback. Free text still
// goes in the comment box; these exist so the same complaint can be counted
// across hundreds of submissions instead of read one at a time.
const ISSUE_TAGS = [
  { value: "wrong_marks",        label: "Wrong marks" },
  { value: "wrong_model_answer", label: "Model answer wrong" },
  { value: "missed_my_point",    label: "Missed my point" },
  { value: "too_harsh",          label: "Too harsh" },
  { value: "too_lenient",        label: "Too lenient" },
  { value: "confusing_feedback", label: "Confusing" },
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface EvaluationResult {
  marks_awarded: number;
  total_marks: number;
  // marking_points[] is what the API returns now; points_hit/points_missed are
  // retired and survive here only so evaluations persisted before the change
  // still render. Both are optional — never read either without a fallback.
  marking_points?: {
    point: string;
    marks: number;
    status: "awarded" | "partial" | "missed";
    marks_awarded: number;
    matched_text: string | null;
    anchor: { start: number; end: number } | null;
  }[];
  points_hit?: string[];
  points_missed?: string[];
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

const NON_OCR_LOADING_MESSAGES = [
  "Analyzing text structure…",
  "Hunting for those precious keywords…",
  "Evaluating conceptual clarity and depth…",
  "Finalizing your score…",
];

// ─── Sub-components ───────────────────────────────────────────────────────────

// The eval engine now returns one structured marking_points[] instead of two
// flat string arrays (handoff §9: points_hit/points_missed are retired, and
// the two lists are that array filtered by status). Older persisted rows still
// carry the flat arrays, so both paths stay live until this view is rebuilt.
function awardedPoints(result: EvaluationResult): string[] {
  return result.marking_points?.length
    ? result.marking_points.filter((p) => p.status !== "missed").map((p) => p.point)
    : result.points_hit ?? [];
}

function missedPoints(result: EvaluationResult): string[] {
  return result.marking_points?.length
    ? result.marking_points.filter((p) => p.status === "missed").map((p) => p.point)
    : result.points_missed ?? [];
}

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
    <p className="m-0 text-center text-[10px] font-semibold text-muted-foreground">
      <span className={creditCountClass(tokensRemaining)}>{tokensRemaining}</span>
      {" "}credit{tokensRemaining !== 1 ? "s" : ""} left this week
      {tokenCost > 0 && (
        <> · costs <span className="font-semibold text-foreground">{tokenCost}</span></>
      )}
    </p>
  );
}

const textareaClass = `${inputBase} w-full px-3 py-2.5 disabled:bg-card/50`;

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
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded border border-border px-3 py-1.5 text-xs font-bold text-foreground transition-colors hover:border-cursor hover:text-cursor"
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
        <p className="m-0 max-w-[280px] text-center text-[10px] leading-relaxed text-paper-ink-soft">
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
        <p className="m-0 max-w-[240px] text-center text-[10px] leading-relaxed text-paper-ink-soft">
          Figure not available yet
          <br />
          <span className="text-[#8A8878]">Refer to your printed paper.</span>
        </p>
      </div>
    );
  }

  return null;
}

// ─── Context block (extract/stimulus) ──────────────────────────────────────
// Renders the passage, literary extract, or picture a question refers to,
// above question_text. Only History & Civics and English Literature rows
// carry this data today; every other subject falls through to no context.
//
// Pictures are NOT handled here — a History & Civics picture question is a
// diagram like any other subject's, so it goes through diagram_url/
// diagram_source/diagram_required and the existing FigureSlot/Report-figure
// machinery below (see scripts/sync_diagram_figures.mjs, which now covers
// the "history" folder the same way it already covers the four science
// subjects). This block covers only what FigureSlot doesn't: literary
// extracts, historical passages, and reference tables.

function LiteratureContext({ q }: { q: Question }) {
  if (!q.literary_work && !q.extract) return null;
  return (
    <div className={contextItem}>
      {q.literary_work && (
        <p className={contextMeta}>
          &ldquo;{q.literary_work.title}&rdquo;
          {q.literary_work.author ? ` — ${q.literary_work.author}` : ""}
        </p>
      )}
      {q.extract?.context_before && <p className={contextItalic}>{q.extract.context_before}</p>}
      {q.extract?.text && <p className={contextExtractText}>{q.extract.text}</p>}
      {(q.extract?.speaker || q.extract?.reference) && (
        <p className={contextSource}>
          {[q.extract?.speaker, q.extract?.reference].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}

function PassageContext({ stimulus }: { stimulus: StimulusData }) {
  return (
    <div className={contextItem}>
      <blockquote className={contextBlockquote}>{stimulus.text}</blockquote>
      {stimulus.source && <p className={contextSource}>Source: {stimulus.source}</p>}
    </div>
  );
}

function TableContext({ table }: { table: TableData }) {
  if (!table.rows?.length) return null;
  return (
    <div className={contextItem}>
      <table className={contextTable}>
        {table.headers && (
          <thead>
            <tr>
              {table.headers.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {table.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContextBlock({ subject, q }: { subject: string; q: Question }) {
  const blocks: React.ReactNode[] = [];

  if (subject === "English Literature") {
    if (q.literary_work || q.extract) blocks.push(<LiteratureContext q={q} key="lit" />);
  }

  if (subject === "History & Civics") {
    if (q.stimulus?.type === "passage") {
      blocks.push(<PassageContext stimulus={q.stimulus} key="passage" />);
    }
    // Skip when a diagram_url figure already exists for this row — a couple
    // of rows have both because their table_data is a transcription of the
    // same screenshot FigureSlot renders below (see sync_diagram_figures.mjs
    // fan-out); showing the table again on top of it just duplicates it.
    if (q.table_data && !q.diagram_url) {
      blocks.push(<TableContext table={q.table_data} key="table" />);
    }
  }

  if (blocks.length === 0) return null;

  return <div className={contextWrapper}>{blocks}</div>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EvaluatePage() {
  const supabase = createClient();
  const router   = useRouter();

  // ─── Deep link ──────────────────────────────────────────────
  //
  // /evaluate?subject=History&q=<question id>&src=notification opens that
  // question directly. Reattempt prompts (in-app and email) link here, and a
  // prompt that dropped the student on an empty picker would ask them to find
  // the question again themselves. `src` rides along into QUESTION_SELECTED
  // and ANSWER_SUBMITTED so a return can be credited to what caused it.
  //
  // Read once, into initial state and refs. The page is dynamically rendered
  // (see evaluate/layout.tsx), so the server render sees the same params and
  // the initial state matches on hydration.
  const searchParams = useSearchParams();
  const [initialSubject] = useState(() => {
    const s = searchParams.get("subject");
    return s && (SUBJECTS as readonly string[]).includes(s) ? s : "";
  });
  const pendingQuestionRef = useRef<string | null>(initialSubject ? searchParams.get("q") : null);
  const returnSourceRef = useRef<string | null>(searchParams.get("src")?.slice(0, 32) ?? null);

  const [authChecked,       setAuthChecked]       = useState(false);
  const [subject,           setSubject]           = useState(initialSubject);
  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const [studentAnswer,     setStudentAnswer]     = useState("");
  const [questions,         setQuestions]         = useState<Question[]>([]);
  const [loadingQuestions,  setLoadingQuestions]  = useState(Boolean(initialSubject));
  const [evaluating,        setEvaluating]        = useState(false);
  const [result,            setResult]            = useState<EvaluationResult | null>(null);
  const [error,             setError]             = useState<string | null>(null);
  const [tokensRemaining,   setTokensRemaining]   = useState<number>(WEEKLY_CREDIT_LIMIT);
  const [limitReached,      setLimitReached]      = useState(false);
  const [feedbackText,      setFeedbackText]      = useState("");
  const [feedbackSent,      setFeedbackSent]      = useState(false);
  const questionOpenedAt = useRef<number | null>(null);
  const [evalRating,        setEvalRating]        = useState<"up" | "down" | null>(null);
  const [evalFeedbackText,  setEvalFeedbackText]  = useState("");
  const [evalIssueTags,     setEvalIssueTags]     = useState<string[]>([]);
  const [evalFeedbackStatus, setEvalFeedbackStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [zoomedFigure,      setZoomedFigure]      = useState<string | null>(null);
  const [reportOpen,        setReportOpen]        = useState(false);
  const [reportText,        setReportText]        = useState("");
  const [reportSent,        setReportSent]        = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  // ─── Abandonment tracking ───────────────────────────────────
  //
  // The interesting drop-off is not the one we can see — it is the student who
  // opened a question, maybe typed a little, and left. That never reaches the
  // server, so it has to be caught here, and in a ref rather than state: the
  // pagehide and unmount handlers below run outside React's render cycle and
  // would otherwise close over a stale snapshot.
  const attemptRef = useRef<{
    questionId: string;
    questionNumber: string;
    subject: string;
    year: number;
    openedAt: number;
    typedChars: number;
    startedTyping: boolean;
    submitted: boolean;
    reported: boolean;
    /** What brought the student to this question: "notification", "email", or null. */
    source: string | null;
  } | null>(null);

  const flushAbandonment = useCallback((reason: string) => {
    const attempt = attemptRef.current;
    if (!attempt || attempt.submitted || attempt.reported) return;
    // Latched, so a page that both unmounts and fires pagehide reports once.
    attempt.reported = true;

    track(
      EVENTS.EVALUATION_ABANDONED,
      {
        stage: attempt.startedTyping ? "answer_started" : "question_selected",
        reason,
        question_id: attempt.questionId,
        question_number: attempt.questionNumber,
        subject: attempt.subject,
        year: attempt.year || null,
        chars_typed: attempt.typedChars,
        dwell_ms: Date.now() - attempt.openedAt,
      },
      // The document may be going away; only a beacon is guaranteed to leave.
      { beacon: true },
    );
  }, []);

  useEffect(() => {
    // pagehide only — not visibilitychange. Switching tabs is not abandoning a
    // question, and treating it as one would drown the real signal.
    const onPageHide = () => flushAbandonment("page_hidden");
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      flushAbandonment("navigated_away");
    };
  }, [flushAbandonment]);

  /**
   * Every answer input routes through here so the first keystroke (or first
   * option click) is recorded exactly once per question. "Selected a question"
   * and "actually attempted it" are different funnel steps, and the gap between
   * them is worth seeing.
   */
  const handleAnswerChange = useCallback((value: string) => {
    setStudentAnswer(value);
    const attempt = attemptRef.current;
    if (!attempt) return;
    attempt.typedChars = value.length;
    if (!attempt.startedTyping && value.trim().length > 0) {
      attempt.startedTyping = true;
      track(EVENTS.ANSWER_TYPING_STARTED, {
        question_id: attempt.questionId,
        question_number: attempt.questionNumber,
        subject: attempt.subject,
        year: attempt.year || null,
        time_to_first_input_ms: Date.now() - attempt.openedAt,
      });
    }
  }, []);

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
          setTokensRemaining(data.tokens_remaining ?? WEEKLY_CREDIT_LIMIT);
        }
      } catch {}
    }
    fetchTokens();
  }, [authChecked]);

  /**
   * Opens the attempt record for a question: the abandonment ref, the
   * time-to-submit clock, and QUESTION_SELECTED. Shared by a picker click and
   * a deep link, so both are measured identically.
   */
  const beginAttempt = useCallback((q: Question, source: string | null) => {
    questionOpenedAt.current = Date.now();
    attemptRef.current = {
      questionId: q.id,
      questionNumber: q.question_number,
      subject,
      year: q.year,
      openedAt: Date.now(),
      typedChars: 0,
      startedTyping: false,
      submitted: false,
      reported: false,
      source,
    };
    track(EVENTS.QUESTION_SELECTED, {
      question_id: q.id,
      question_number: q.question_number,
      subject,
      year: q.year,
      paper: q.paper,
      question_type: q.question_type,
      is_subjective: q.is_subjective,
      source,
    });
  }, [subject]);

  // ─── Loading a subject's questions ──────────────────────────
  //
  // All of a subject's questions (every year and paper) load in one query;
  // QuestionPicker narrows them without going back to the network, and
  // year/paper surface as metadata on each row in Browse.
  //
  // Nothing is reset here. The picker is remounted on a subject change by its
  // key, which clears its own filters, and handleSubjectChange clears what
  // belongs to the page — so this effect only fetches, and the cascade of
  // setState calls that used to live in it is gone.

  useEffect(() => {
    if (!subject) return;
    let cancelled = false;

    async function fetchQuestions() {
      const { data: subjectRow } = await supabase
        .from("subjects").select("id").eq("name", subject).single();
      if (cancelled) return;
      if (!subjectRow) { setLoadingQuestions(false); return; }

      const { data } = await supabase
        .from("questions")
        .select(QUESTION_SELECT)
        .eq("subject_id", subjectRow.id)
        .order("year", { ascending: false })
        .order("question_number", { ascending: true });
      // Two subjects picked in quick succession would otherwise race, and the
      // slower query would overwrite the faster one's results.
      if (cancelled) return;

      const loaded = (data ?? []) as unknown as Question[];
      setQuestions(loaded);
      setLoadingQuestions(false);

      // A deep-linked question opens once, on the first load of its subject.
      const pending = pendingQuestionRef.current;
      if (pending) {
        pendingQuestionRef.current = null;
        const match = loaded.find((q) => q.id === pending);
        if (match) {
          setSelectedQuestionId(match.id);
          beginAttempt(match, returnSourceRef.current);
        }
        // Drop the params so a refresh, or a later subject change, doesn't
        // reopen the linked question. Next keeps its router in sync with the
        // native history API.
        window.history.replaceState(null, "", "/evaluate");
      }
    }

    fetchQuestions();
    return () => { cancelled = true; };
  }, [subject, supabase, beginAttempt]);

  // selectedQuestion is derived, not stored: two sources of truth for "which
  // question is open" is how the answer box could end up attached to a
  // different question than the sheet above it.
  const selectedQuestion = questions.find((q) => q.id === selectedQuestionId) ?? null;

  const handleSubjectChange = useCallback((next: string) => {
    flushAbandonment("switched_question");
    attemptRef.current = null;
    setSubject(next);
    setQuestions([]);
    setLoadingQuestions(Boolean(next));
    setSelectedQuestionId("");
    setStudentAnswer(""); setResult(null); setError(null);
  }, [flushAbandonment]);

  /** Step 5 commits a question — or, with "", reopens Browse. */
  const handleSelectQuestion = useCallback((id: string) => {
    // Moving off a question without submitting is itself a drop-off, and has
    // to be reported before the ref is overwritten.
    flushAbandonment("switched_question");

    setSelectedQuestionId(id);
    setStudentAnswer(""); setResult(null); setError(null);
    // Reset the figure-report form too, or a report typed for one question
    // would carry over — and worse, the "we'll review this" acknowledgement
    // would still be showing against a different figure.
    setReportOpen(false); setReportText(""); setReportSent(false); setZoomedFigure(null);

    const q = id ? questions.find((x) => x.id === id) ?? null : null;
    if (!q) {
      attemptRef.current = null;
      questionOpenedAt.current = null;
      return;
    }

    beginAttempt(q, null);
  }, [flushAbandonment, questions, beginAttempt]);

  // ─── Loading message rotation (non-OCR path only — no upload path exists yet) ─

  // The reset lives in handleSubmit, not here: setting state in an effect body
  // only to undo it is a cascading render for no gain.
  useEffect(() => {
    if (!evaluating) return;
    const interval = setInterval(() => {
      setLoadingMessageIndex((i) => Math.min(i + 1, NON_OCR_LOADING_MESSAGES.length - 1));
    }, 2500);
    return () => clearInterval(interval);
  }, [evaluating]);

  // ─── Submit ───────────────────────────────────────────────────────────────

  // useCallback, not a bare function: the timing calls below read the clock,
  // and a function declared in the render body is not, to the compiler, an
  // event handler — so Date.now() there reads as an impure call during render.
  const handleSubmit = useCallback(async () => {
    if (!subject || !selectedQuestion || !studentAnswer.trim()) return;

    const timeToSubmit = questionOpenedAt.current ? Date.now() - questionOpenedAt.current : null;
    // Closes the abandonment window for this question before any await, so a
    // slow evaluation cannot be reported as a walk-away.
    if (attemptRef.current) attemptRef.current.submitted = true;

    track(EVENTS.ANSWER_SUBMITTED, {
      question_id: selectedQuestion.id,
      question_number: selectedQuestion.question_number,
      subject,
      year: selectedQuestion.year,
      paper: selectedQuestion.paper,
      question_type: selectedQuestion.question_type,
      is_subjective: selectedQuestion.is_subjective,
      answer_length: studentAnswer.trim().length,
      time_to_submit_ms: timeToSubmit,
      source: attemptRef.current?.source ?? null,
    });

    setEvaluating(true); setResult(null); setError(null); setLoadingMessageIndex(0);
    setLimitReached(false); setFeedbackText(""); setFeedbackSent(false);
    setEvalRating(null); setEvalFeedbackText(""); setEvalIssueTags([]); setEvalFeedbackStatus("idle");

    try {
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_number: selectedQuestion.question_number,
          year: selectedQuestion.year,
          paper: selectedQuestion.paper,
          subject,
          student_answer: studentAnswer,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) setLimitReached(true);
        // A persist failure (500) refunds the reserved token server-side and
        // reports the balance back here too — without this the badge kept
        // showing the reservation spent, so a retry looked free when it
        // wasn't, or the student assumed they'd been charged when they hadn't.
        if (data.tokens_remaining !== undefined) setTokensRemaining(data.tokens_remaining);
        setError(data?.error ?? "Evaluation failed. Try again.");
      } else {
        setResult(data as EvaluationResult);
        if (data.tokens_remaining !== undefined) setTokensRemaining(data.tokens_remaining);
      }
    } catch {
      // The only failure the server cannot see for itself. Every other stage —
      // quota, Anthropic, parse, persist — is recorded in /api/evaluate, where
      // the actual cause is known; reporting those here too would double-count
      // them in the error panel.
      track(EVENTS.EVALUATION_FAILED, {
        failure_stage: FAILURE_STAGES.NETWORK_ERROR,
        question_id: selectedQuestion.id,
        subject,
        year: selectedQuestion.year,
      });
      setError("Network error. Check your connection.");
    } finally {
      setEvaluating(false);
    }
  }, [subject, selectedQuestion, studentAnswer]);

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
          message: `[FIGURE REPORT] ${subject} ${selectedQuestion.year} Q${selectedQuestion.question_number} `
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
        // rating and tags travel as structured fields as well as inside the
        // message, so they can be counted without parsing prose back out.
        body: JSON.stringify({
          message: formattedMessage,
          rating: evalRating,
          tags: evalIssueTags,
          source: "evaluation_result",
        }),
      });
      if (!res.ok) throw new Error();
      setEvalFeedbackStatus("success");
    } catch {
      setEvalFeedbackStatus("error");
    }
  }

  const tokenCost = selectedQuestion
    ? (isSubjectiveGraded(selectedQuestion) ? CREDIT_COST_SUBJECTIVE : CREDIT_COST_OBJECTIVE)
    : 0;
  const canSubmit = Boolean(
    subject && selectedQuestion && studentAnswer.trim() &&
    !evaluating && !isDiagramBlocked(selectedQuestion)
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
          label={`Figure — ${subject} ${selectedQuestion.year} Q${selectedQuestion.question_number}`}
          onClose={() => setZoomedFigure(null)}
        />
      )}

      <header className="mb-8">
        <p className={sectionLabel}>Practice</p>
        <h1 className="display-section mt-2">Questions</h1>
        <p className="mt-4 max-w-[var(--measure)] text-muted-foreground">
          Narrow down to a past-paper question, write your answer, and see exactly which
          marking points earned marks and which did not.
        </p>
      </header>

      {/* Steps 1–5 of handoff §12. The picker is keyed on subject so a new
          subject remounts it, resetting chapter/topic/format/year/search
          without an effect that watches for the change and undoes itself. */}
      <QuestionPicker
        key={subject}
        subject={subject}
        onSubjectChange={handleSubjectChange}
        questions={questions}
        loading={loadingQuestions}
        selectedId={selectedQuestionId}
        onSelect={handleSelectQuestion}
      />

      {/* Sheet on the left, answer on the right. The sheet is wider — it holds
          the question and its figure, which is what the student reads. */}
      <div className="grid gap-4 lg:grid-cols-[1.32fr_1fr] lg:items-start">

        {/* ── The paper sheet ── */}
        {selectedQuestion && (
          <div className={sheet}>
            <div className={sheetTop}>
              <span className="text-xs font-medium tracking-tight text-paper-ink">
                Q{selectedQuestion.question_number}
              </span>
              {selectedQuestion.topic && (
                <span className="text-[10px] tracking-wide text-paper-ink-soft">
                  {selectedQuestion.topic}
                </span>
              )}
              {totalMarksOf(selectedQuestion) != null && (
                <span className="ml-auto whitespace-nowrap rounded border border-[#BDBBAD] bg-paper px-2 py-0.5 text-[11px] font-semibold text-[#33322B]">
                  {totalMarksOf(selectedQuestion)} mark{totalMarksOf(selectedQuestion) === 1 ? "" : "s"}
                </span>
              )}
            </div>

            <div className={sheetBody}>
              {subject && <ContextBlock subject={subject} q={selectedQuestion} />}

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
                ICSE {subject} · {selectedQuestion.year}
              </span>
            </div>

            {/* A student flagging a bad crop or a leaked answer is the only QA
                loop that scales past manual re-audit of every figure. */}
            {reportOpen && hasFigureContext(selectedQuestion) && (
              <div className="border-t border-paper-rule bg-paper-foot px-4 py-3">
                {reportSent ? (
                  <p className="m-0 text-[10px] text-[#2F6B3D]">
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
                      className="self-start rounded border border-[#BDBBAD] bg-white px-3 py-1.5 text-[10px] font-bold text-[#2F2E28] transition-colors hover:border-cursor disabled:opacity-40"
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
                          <input type="radio" name="mcq_answer" value={value} checked={studentAnswer === value} onChange={(e) => handleAnswerChange(e.target.value)} className="sr-only" />
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
                          key={opt} type="button" onClick={() => handleAnswerChange(opt)}
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
                      type="text" value={studentAnswer} onChange={(e) => handleAnswerChange(e.target.value)}
                      placeholder={selectedQuestion.question_type === "match" ? "e.g. A-3, B-1, C-4, D-2" : "Type your answer…"}
                      className={`${inputBase} h-10 w-full px-3`}
                    />
                  </div>

                /* Subjective */
                ) : (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-medium text-muted-foreground">Write your answer</label>
                    <textarea
                      value={studentAnswer} onChange={(e) => handleAnswerChange(e.target.value)} rows={8}
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
                  <span className={numericFigures}>{result.token_cost}</span> credit{result.token_cost !== 1 ? "s" : ""} used ·{" "}
                  <span className={numericFigures}>{result.tokens_remaining}</span> remaining
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
                      <Section
                        title="Points awarded"
                        items={awardedPoints(result)}
                        color="text-status-correct"
                      />
                      <Section
                        title="Points missed"
                        items={missedPoints(result)}
                        color="text-status-wrong"
                      />
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
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-tag-improvement-tips-subtle text-xs font-bold text-tag-improvement-tips">
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
                          {/* Only shown on a thumbs-down: asking a happy
                              student to categorise what went wrong reads as an
                              accusation that something did. */}
                          {evalRating === "down" && (
                            <div className="flex flex-wrap gap-2">
                              {ISSUE_TAGS.map((tag) => {
                                const active = evalIssueTags.includes(tag.value);
                                return (
                                  <button
                                    key={tag.value}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() =>
                                      setEvalIssueTags((prev) =>
                                        prev.includes(tag.value)
                                          ? prev.filter((t) => t !== tag.value)
                                          : [...prev, tag.value],
                                      )
                                    }
                                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                                      active
                                        ? "border-accent bg-accent/10 text-accent"
                                        : "border-border bg-card text-muted-foreground hover:bg-border/40"
                                    }`}
                                  >
                                    {tag.label}
                                  </button>
                                );
                              })}
                            </div>
                          )}
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
