"use client";

// The whole paper, answered in one place: a cover page, then one question at a
// time with a question list to move around, answers that save as they're
// typed, a review of what's answered before handing in, and the hand-in
// itself. Nothing is marked, and no marks are shown, until the paper is
// submitted.
//
// Autosave: each answer is saved through saveAnswer() shortly after typing
// stops, one request per question at a time (the latest text always wins), and
// mirrored to localStorage so a dropped connection or a closed tab loses
// nothing. The server copy is the real one; the local copy only fills in
// answers newer than what the server has.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Flag } from "lucide-react";
import {
  btnPrimary,
  btnSecondary,
  errorAlert,
  inputBase,
  numericFigures,
  sheet,
  sheetBody,
  sheetQuestionText,
  sheetTop,
} from "@/lib/ui";
import { CREDIT_COST_OBJECTIVE, CREDIT_COST_SUBJECTIVE } from "@/lib/constants";
import { approxMinutes, SET_TYPES, type SetType } from "@/lib/practice-sets/constants";
import type { PaperQuestion } from "@/lib/practice-sets/read";
import { mcqOptionLabel, mcqOptionValue } from "../../../evaluate/_lib/question";
import { ContextBlock, FigureSlot, FigureViewer } from "../../../_components/QuestionSheetParts";
import { saveAnswer, startPaper, submitPaper } from "../../actions";
import { MarkingScreen } from "./MarkingScreen";

interface DraftAnswer {
  text: string;
  flagged: boolean;
}

export interface AttemptPaper {
  id: string;
  subject: string;
  totalMarks: number;
  startedAt: string | null;
  /** Set when the student asked for a marks total the papers couldn't hit exactly. */
  targetMarks: number | null;
  retry: boolean;
  questions: PaperQuestion[];
  answers: Record<string, DraftAnswer & { updatedAt: string }>;
}

type SaveState = "saved" | "saving" | "offline" | "locked" | "closed";

const SAVE_DELAY_MS = 900;

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

function excerpt(text: string, max = 140): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.7))}…`;
}

function isWritten(q: PaperQuestion): boolean {
  return q.type === "short" || q.type === "long";
}

/** Sections in paper order, lettered A, B, C from the ones this paper actually has. */
function sectionsOf(questions: PaperQuestion[]) {
  const groups: { key: SetType | "other"; label: string; questions: PaperQuestion[] }[] = SET_TYPES.map((t) => ({
    key: t.key,
    label: t.label,
    questions: questions.filter((q) => q.type === t.key),
  }));
  // A question that can no longer be classified (its data changed after the
  // paper was built) still belongs on the paper.
  groups.push({ key: "other", label: "Other questions", questions: questions.filter((q) => !q.type) });
  return groups
    .filter((g) => g.questions.length)
    .map((g, i) => ({ ...g, letter: String.fromCharCode(65 + i) }));
}

// ─── Local backup ────────────────────────────────────────────────────────────

const storageKey = (id: string) => `be_paper_${id}`;

function readBackup(id: string): Record<string, DraftAnswer & { ts: number }> {
  try {
    return JSON.parse(window.localStorage.getItem(storageKey(id)) ?? "{}");
  } catch {
    return {};
  }
}

function writeBackup(id: string, qid: string, a: DraftAnswer) {
  try {
    const all = readBackup(id);
    all[qid] = { ...a, ts: Date.now() };
    window.localStorage.setItem(storageKey(id), JSON.stringify(all));
  } catch {
    // Private mode or storage full: the server save is still the real one.
  }
}

function clearBackup(id: string) {
  try {
    window.localStorage.removeItem(storageKey(id));
  } catch {}
}

// ─── Answer inputs ───────────────────────────────────────────────────────────

const choice = (on: boolean) =>
  `flex w-full cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
    on ? "border-accent bg-accent-subtle text-foreground" : "border-border bg-card text-foreground/90 hover:border-foreground/30"
  }`;

function AnswerInput({
  q,
  value,
  onChange,
}: {
  q: PaperQuestion;
  value: string;
  onChange: (v: string) => void;
}) {
  const question = q.question;
  if (question.question_type === "mcq" && question.options?.length) {
    return (
      <fieldset>
        <legend className="text-xs font-medium text-muted-foreground">Choose one option</legend>
        <div className="mt-3 space-y-2">
          {question.options.map((opt, i) => {
            const v = mcqOptionValue(opt);
            return (
              <label key={i} className={choice(value === v)}>
                <input
                  type="radio"
                  name={`q-${q.id}`}
                  value={v}
                  checked={value === v}
                  onChange={() => onChange(v)}
                  className="sr-only"
                />
                {/* A plain radio mark: option text already carries its own (a)/(b) or A./B. lettering. */}
                <span
                  aria-hidden
                  className={`mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-2 ${
                    value === v ? "border-accent" : "border-border"
                  }`}
                >
                  {value === v ? <span className="h-2 w-2 rounded-full bg-accent" /> : null}
                </span>
                <span>{mcqOptionLabel(opt)}</span>
              </label>
            );
          })}
        </div>
        {value ? (
          <button type="button" onClick={() => onChange("")} className="mt-3 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
            Clear my choice
          </button>
        ) : null}
      </fieldset>
    );
  }

  if (question.question_type === "true_false") {
    return (
      <fieldset>
        <legend className="text-xs font-medium text-muted-foreground">True or false?</legend>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {["True", "False"].map((opt) => (
            <label key={opt} className={`${choice(value === opt)} justify-center font-medium`}>
              <input
                type="radio"
                name={`q-${q.id}`}
                value={opt}
                checked={value === opt}
                onChange={() => onChange(opt)}
                className="sr-only"
              />
              {opt}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  if (!isWritten(q)) {
    const match = question.question_type === "match";
    return (
      <div>
        <label htmlFor={`a-${q.id}`} className="text-xs font-medium text-muted-foreground">
          {match ? "Write the pairs as A-1, B-2, C-3, D-4" : "Your answer"}
        </label>
        <input
          id={`a-${q.id}`}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={match ? "e.g. A-3, B-1, C-4, D-2" : "Type your answer"}
          autoComplete="off"
          className={`${inputBase} mt-2 h-11 w-full px-3 text-[15px]`}
        />
      </div>
    );
  }

  const words = value.trim() ? value.trim().split(/\s+/).length : 0;
  return (
    <div>
      <label htmlFor={`a-${q.id}`} className="text-xs font-medium text-muted-foreground">
        Your answer
      </label>
      <textarea
        id={`a-${q.id}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={q.type === "long" ? 12 : 6}
        maxLength={12000}
        placeholder="Write your answer as you would in the exam."
        className={`${inputBase} mt-2 w-full px-4 py-3 text-[15px] leading-relaxed`}
      />
      <p className={`${numericFigures} mt-1.5 text-right text-xs text-muted-foreground`}>
        {words} {words === 1 ? "word" : "words"}
      </p>
    </div>
  );
}

// ─── Attempt ─────────────────────────────────────────────────────────────────

export function PaperAttempt({
  paper,
  creditsRemaining,
  answerLimit,
}: {
  paper: AttemptPaper;
  creditsRemaining: number;
  /** How many answers can be marked before parental consent; null when consent is confirmed. */
  answerLimit: number | null;
}) {
  const router = useRouter();
  const sections = useMemo(() => sectionsOf(paper.questions), [paper.questions]);
  const sectionOf = useMemo(
    () => new Map(sections.flatMap((s) => s.questions.map((q) => [q.id, s] as const))),
    [sections],
  );

  const [view, setView] = useState<"cover" | "paper" | "review" | "marking">(paper.startedAt ? "paper" : "cover");
  const [startedAt, setStartedAt] = useState(paper.startedAt);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, DraftAnswer>>(() =>
    Object.fromEntries(Object.entries(paper.answers).map(([k, a]) => [k, { text: a.text, flagged: a.flagged }])),
  );
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [zoomed, setZoomed] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // ── Saving ──
  const latest = useRef<Record<string, DraftAnswer>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const inFlight = useRef<Record<string, Promise<void> | undefined>>({});
  const dirty = useRef(new Set<string>());

  const flush = useCallback(
    (qid: string): Promise<void> => {
      clearTimeout(timers.current[qid]);
      if (inFlight.current[qid]) {
        // One request per question at a time; whatever arrived meanwhile goes next.
        return inFlight.current[qid]!.then(() => (dirty.current.has(qid) ? flush(qid) : undefined));
      }
      if (!dirty.current.has(qid)) return Promise.resolve();
      const a = latest.current[qid];
      dirty.current.delete(qid);
      setSaveState("saving");
      const run = saveAnswer({ setId: paper.id, questionId: qid, text: a.text, flagged: a.flagged })
        .then((res) => {
          if (res.ok) {
            if (!dirty.current.size) setSaveState("saved");
          } else if (res.reason === "locked" || res.reason === "closed") {
            setSaveState(res.reason);
          } else {
            dirty.current.add(qid);
            setSaveState("offline");
          }
        })
        .catch(() => {
          dirty.current.add(qid);
          setSaveState("offline");
        })
        .finally(() => {
          inFlight.current[qid] = undefined;
        });
      inFlight.current[qid] = run;
      return run;
    },
    [paper.id],
  );

  const flushAll = useCallback(
    () => Promise.all([...new Set([...dirty.current, ...Object.keys(inFlight.current)])].map((qid) => flush(qid))),
    [flush],
  );

  const answersRef = useRef(answers);
  const update = useCallback(
    (qid: string, patch: Partial<DraftAnswer>) => {
      const next: DraftAnswer = { ...(answersRef.current[qid] ?? { text: "", flagged: false }), ...patch };
      answersRef.current = { ...answersRef.current, [qid]: next };
      setAnswers(answersRef.current);
      latest.current[qid] = next;
      dirty.current.add(qid);
      writeBackup(paper.id, qid, next);
      clearTimeout(timers.current[qid]);
      // A flag is a single click: save it straight away. Typing waits for a pause.
      timers.current[qid] = setTimeout(() => void flush(qid), patch.flagged !== undefined ? 0 : SAVE_DELAY_MS);
      setSaveState((s) => (s === "locked" || s === "closed" ? s : "saving"));
    },
    [flush, paper.id],
  );

  // Fill in anything the local backup has that's newer than the server's copy
  // (an answer typed while offline, or in the seconds before a tab closed).
  useEffect(() => {
    const backup = readBackup(paper.id);
    for (const [qid, b] of Object.entries(backup)) {
      if (!paper.questions.some((q) => q.id === qid)) continue;
      const server = paper.answers[qid];
      const serverTs = server ? Date.parse(server.updatedAt) : 0;
      if (b.ts > serverTs && (b.text !== (server?.text ?? "") || b.flagged !== (server?.flagged ?? false))) {
        update(qid, { text: b.text, flagged: b.flagged });
      }
    }
    // Once, on mount: later edits go through update() directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retry unsaved answers when the connection comes back, and warn before
  // leaving with anything unsaved.
  useEffect(() => {
    const online = () => void flushAll();
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current.size || Object.values(inFlight.current).some(Boolean)) e.preventDefault();
    };
    window.addEventListener("online", online);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [flushAll]);

  useEffect(() => {
    if (saveState !== "offline") return;
    const t = setTimeout(() => void flushAll(), 5000);
    return () => clearTimeout(t);
  }, [saveState, flushAll]);

  // ── Elapsed time (minutes are enough; a ticking seconds counter is pressure, not help) ──
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  const elapsedMin = startedAt ? Math.max(0, Math.floor((now - Date.parse(startedAt)) / 60_000)) : 0;

  // ── Derived ──
  const questions = paper.questions;
  const current = questions[index];
  const isAnswered = (qid: string) => Boolean(answers[qid]?.text.trim());
  const answeredCount = questions.filter((q) => isAnswered(q.id)).length;
  const flaggedCount = questions.filter((q) => answers[q.id]?.flagged).length;
  const markingCost = questions.reduce(
    (s, q) => s + (isAnswered(q.id) ? (isWritten(q) ? CREDIT_COST_SUBJECTIVE : CREDIT_COST_OBJECTIVE) : 0),
    0,
  );
  const sectionMarks = (key: SetType | "other") =>
    questions.filter((q) => (q.type ?? "other") === key).reduce((s, q) => s + q.marks, 0);

  const go = (i: number) => {
    if (current) void flush(current.id);
    setIndex(Math.max(0, Math.min(questions.length - 1, i)));
    setView("paper");
    setNavOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openReview = () => {
    void flushAll();
    setView("review");
    setConfirming(false);
    window.scrollTo({ top: 0 });
  };

  const start = async () => {
    setStarting(true);
    await startPaper(paper.id).catch(() => null);
    setStartedAt(new Date().toISOString());
    setStarting(false);
    setView("paper");
  };

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    await flushAll();
    if (dirty.current.size) {
      setSubmitting(false);
      setSubmitError("Some answers haven’t saved yet. Check your connection, then submit again.");
      return;
    }
    const res = await submitPaper(paper.id).catch(() => ({ ok: false as const, message: "We couldn’t submit your paper just now. Please try again." }));
    setSubmitting(false);
    if (!res.ok) {
      setSubmitError(res.message);
      return;
    }
    clearBackup(paper.id);
    setView("marking");
    window.scrollTo({ top: 0 });
  };

  // ── Views ──

  if (view === "marking") {
    return (
      <div className="mx-auto min-h-screen max-w-2xl px-6 py-16">
        <MarkingScreen setId={paper.id} subject={paper.subject} total={questions.length} onDone={() => router.refresh()} />
      </div>
    );
  }

  if (view === "cover") {
    const minutes = approxMinutes(paper.totalMarks);
    return (
      <div className="mx-auto min-h-screen max-w-3xl px-6 py-12">
        <Link href="/practice-paper" className="text-sm text-muted-foreground hover:text-foreground">
          Practice papers
        </Link>
        <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
          <div className="border-b border-rule px-6 py-8 text-center sm:px-10">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {paper.retry ? "Retry paper" : "Practice paper"} · ICSE Class 10
            </p>
            <h1 className="mt-3 font-display text-4xl text-foreground">{paper.subject}</h1>
            <p className={`${numericFigures} mt-4 text-sm text-muted-foreground`}>
              {questions.length} questions · {fmt(paper.totalMarks)} marks · about {minutes} minutes
            </p>
            {paper.targetMarks ? (
              <p className="mt-2 text-xs text-muted-foreground">
                You asked for {paper.targetMarks} marks; this is the closest the board papers allow.
              </p>
            ) : null}
          </div>

          <div className="grid gap-px bg-rule sm:grid-cols-3">
            {sections.map((s) => (
              <div key={s.key} className="bg-card px-6 py-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Section {s.letter}</p>
                <p className="mt-1 font-medium text-foreground">{s.label}</p>
                <p className={`${numericFigures} mt-1 text-sm text-muted-foreground`}>
                  {s.questions.length} {s.questions.length === 1 ? "question" : "questions"} · {fmt(sectionMarks(s.key))} marks
                </p>
              </div>
            ))}
          </div>

          <div className="border-t border-rule px-6 py-7 sm:px-10">
            <p className="text-sm font-semibold text-foreground">Before you begin</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground marker:text-rule">
              <li>Answer in any order. The question list lets you move around the paper.</li>
              <li>Your answers save automatically as you type.</li>
              <li>Flag a question to come back to it before you hand in.</li>
              <li>
                Nothing is marked until you submit. Then the whole paper is marked together, written answers
                point by point.
              </li>
              {answerLimit !== null ? (
                <li className="text-foreground">
                  Until your parent or guardian confirms consent, up to {answerLimit}{" "}
                  {answerLimit === 1 ? "answer" : "answers"} can be marked.
                </li>
              ) : null}
            </ul>
            <button type="button" onClick={start} disabled={starting} className={`${btnPrimary} mt-7 h-11 w-full px-8 sm:w-auto`}>
              {starting ? "Starting…" : "Start Paper"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const saveLabel: Record<SaveState, string> = {
    saved: "All answers saved",
    saving: "Saving…",
    offline: "Not saved yet. Retrying",
    locked: "Saving paused: parent consent needed",
    closed: "This paper has been submitted",
  };

  const header = (
    <div className="sticky top-0 z-20 -mx-6 border-b border-rule bg-background/95 px-6 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{paper.subject}</p>
          <p className="text-xs text-muted-foreground">{paper.retry ? "Retry paper" : "Practice paper"}</p>
        </div>
        <p className={`${numericFigures} text-sm text-muted-foreground`}>
          <span className="font-semibold text-foreground">{answeredCount}</span>/{questions.length} answered
        </p>
        {startedAt ? (
          <p className={`${numericFigures} hidden text-sm text-muted-foreground sm:block`}>{elapsedMin} min</p>
        ) : null}
        <p
          className={`text-xs ${saveState === "offline" || saveState === "locked" ? "text-status-wrong" : "text-muted-foreground"}`}
          aria-live="polite"
        >
          {saveLabel[saveState]}
        </p>
        <div className="ml-auto flex gap-2">
          {view === "paper" ? (
            <button type="button" onClick={openReview} className={btnSecondary}>
              Review Paper
            </button>
          ) : (
            <button type="button" onClick={() => go(index)} className={btnSecondary}>
              Back to Paper
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // ── Review ──
  if (view === "review") {
    const unanswered = questions.length - answeredCount;
    const overLimit = answerLimit !== null && answeredCount > answerLimit;
    const shortOfCredits = markingCost > creditsRemaining;
    return (
      <div className="mx-auto min-h-screen max-w-6xl px-6 pb-16">
        {header}
        <div className="mx-auto max-w-3xl pt-10">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Review</p>
          <h1 className="display-section mt-2">Check your paper before you hand it in</h1>

          <dl className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-border bg-rule text-center">
            {[
              { label: "Answered", value: answeredCount },
              { label: "Not answered", value: unanswered },
              { label: "Flagged", value: flaggedCount },
            ].map((s) => (
              <div key={s.label} className="bg-card px-3 py-5">
                <dd className={`${numericFigures} font-display text-3xl text-foreground`}>{s.value}</dd>
                <dt className="mt-1 text-xs text-muted-foreground">{s.label}</dt>
              </div>
            ))}
          </dl>

          {sections.map((s) => (
            <section key={s.key} className="mt-10">
              <h2 className="text-sm font-semibold text-foreground">
                Section {s.letter} <span className="font-normal text-muted-foreground">· {s.label}</span>
              </h2>
              <ul className="mt-3 divide-y divide-rule border-y border-rule">
                {s.questions.map((q) => {
                  const a = answers[q.id];
                  const answered = isAnswered(q.id);
                  return (
                    <li key={q.id} className="flex items-start gap-4 py-4">
                      <span className={`${numericFigures} w-7 shrink-0 font-display text-lg text-accent`}>{q.number}.</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground">{excerpt(q.question.question_text, 120)}</p>
                        <p className="mt-1.5 text-xs">
                          {answered ? (
                            <span className="text-muted-foreground">
                              Your answer: <span className="text-foreground/80">{excerpt(a!.text, 90)}</span>
                            </span>
                          ) : (
                            <span className="font-medium text-status-wrong">Not answered</span>
                          )}
                          {a?.flagged ? (
                            <span className="ml-2 inline-flex items-center gap-1 font-medium text-foreground">
                              <Flag size={11} aria-hidden className="text-status-partial" /> Flagged
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <span className={`${numericFigures} text-xs text-muted-foreground`}>[{fmt(q.marks)}]</span>
                        <button
                          type="button"
                          onClick={() => go(q.number - 1)}
                          className="text-sm font-medium text-accent hover:underline"
                        >
                          {answered ? "Edit" : "Answer"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          <div className="mt-10 rounded-2xl border border-border bg-card p-6">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Marking this paper uses{" "}
              <span className={`${numericFigures} font-semibold text-foreground`}>{markingCost}</span>{" "}
              {markingCost === 1 ? "credit" : "credits"}, one for each written answer you’ve attempted. You have{" "}
              <span className={numericFigures}>{creditsRemaining}</span>. Objective answers and blank questions cost
              nothing.
            </p>
            {unanswered > 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {unanswered} {unanswered === 1 ? "question is" : "questions are"} unanswered and will score zero.
              </p>
            ) : null}
            {overLimit ? (
              <p className={`${errorAlert} mt-4`}>
                Until your parent or guardian confirms consent, up to {answerLimit}{" "}
                {answerLimit === 1 ? "answer" : "answers"} can be marked. You’ve answered {answeredCount}.
              </p>
            ) : null}
            {shortOfCredits && !overLimit ? (
              <p className={`${errorAlert} mt-4`}>
                You need {markingCost} credits to mark this paper and have {creditsRemaining}. Clear a few written
                answers, or submit once your credits refill.
              </p>
            ) : null}
            {submitError ? (
              <p className={`${errorAlert} mt-4`} role="alert">
                {submitError}
              </p>
            ) : null}

            {confirming ? (
              <div className="mt-6 rounded-xl border border-rule bg-background/50 p-5">
                <p className="font-medium text-foreground">Hand in your paper?</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  You won’t be able to change your answers after this. The whole paper is then marked together.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button type="button" onClick={submit} disabled={submitting} className={`${btnPrimary} h-11 px-6`}>
                    {submitting ? "Submitting…" : "Submit Paper"}
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} disabled={submitting} className={`${btnSecondary} h-11`}>
                    Keep Working
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  disabled={answeredCount === 0 || overLimit || shortOfCredits || saveState === "locked"}
                  className={`${btnPrimary} h-11 px-6`}
                >
                  Submit Paper
                </button>
                <button type="button" onClick={() => go(index)} className={`${btnSecondary} h-11`}>
                  Back to Paper
                </button>
              </div>
            )}
            {answeredCount === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">Answer at least one question to submit.</p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // ── Paper ──
  const section = sectionOf.get(current.id);
  const a = answers[current.id] ?? { text: "", flagged: false };

  const navigator = (
    <nav aria-label="Questions" className="space-y-5">
      {sections.map((s) => (
        <div key={s.key}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Section {s.letter} · {s.label}
          </p>
          <ol className="mt-2 grid grid-cols-6 gap-1.5 lg:grid-cols-5">
            {s.questions.map((q) => {
              const on = q.id === current.id;
              const done = isAnswered(q.id);
              const flagged = answers[q.id]?.flagged;
              return (
                <li key={q.id}>
                  <button
                    type="button"
                    onClick={() => go(q.number - 1)}
                    aria-current={on ? "step" : undefined}
                    aria-label={`Question ${q.number}${done ? ", answered" : ", not answered"}${flagged ? ", flagged" : ""}`}
                    className={`relative grid h-9 w-full place-items-center rounded-lg border text-sm tabular-nums transition-colors ${
                      done ? "border-accent/50 bg-accent-subtle text-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"
                    } ${on ? "ring-2 ring-accent ring-offset-2 ring-offset-background" : ""}`}
                  >
                    {q.number}
                    {flagged ? (
                      <span aria-hidden className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-status-partial" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
      <ul className="space-y-1.5 border-t border-rule pt-4 text-xs text-muted-foreground">
        <li className="flex items-center gap-2">
          <span className="h-3 w-3 rounded border border-accent/50 bg-accent-subtle" aria-hidden /> Answered
        </li>
        <li className="flex items-center gap-2">
          <span className="h-3 w-3 rounded border border-border bg-card" aria-hidden /> Not answered
        </li>
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-status-partial" aria-hidden /> Flagged for review
        </li>
      </ul>
    </nav>
  );

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-6 pb-16">
      {header}

      <div className="mt-6 lg:hidden">
        <button
          type="button"
          onClick={() => setNavOpen((v) => !v)}
          aria-expanded={navOpen}
          className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm"
        >
          <span className="font-medium text-foreground">
            Question {current.number} of {questions.length}
          </span>
          <span className="text-muted-foreground">{navOpen ? "Hide questions" : "All questions"}</span>
        </button>
        {navOpen ? <div className="mt-3 rounded-xl border border-border bg-card p-4">{navigator}</div> : null}
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <main className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Section {section?.letter} · {section?.label}
          </p>

          <div className={`${sheet} mt-3`}>
            <div className={sheetTop}>
              <span className="text-sm font-semibold tracking-tight text-paper-ink">Question {current.number}</span>
              {current.chapter ? <span className="text-[11px] tracking-wide text-paper-ink-soft">{current.chapter}</span> : null}
              <span className="ml-auto whitespace-nowrap rounded border border-[#BDBBAD] bg-paper px-2 py-0.5 text-[11px] font-semibold text-[#33322B]">
                {fmt(current.marks)} {current.marks === 1 ? "mark" : "marks"}
              </span>
            </div>
            <div className={sheetBody}>
              <ContextBlock subject={paper.subject} q={current.question} />
              <p className={`${sheetQuestionText} whitespace-pre-line`}>{current.question.question_text}</p>
              <FigureSlot
                q={current.question}
                onZoom={() => current.question.diagram_url && setZoomed(current.question.diagram_url)}
              />
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
            <AnswerInput key={current.id} q={current} value={a.text} onChange={(text) => update(current.id, { text })} />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => go(index - 1)} disabled={index === 0} className={`${btnSecondary} h-11 disabled:opacity-40`}>
              Previous
            </button>
            <button
              type="button"
              onClick={() => update(current.id, { flagged: !a.flagged })}
              aria-pressed={a.flagged}
              className={`inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors ${
                a.flagged ? "border-status-partial bg-status-partial-subtle text-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              <Flag size={15} aria-hidden className={a.flagged ? "text-status-partial" : ""} />
              {a.flagged ? "Flagged" : "Flag for review"}
            </button>
            {index < questions.length - 1 ? (
              <button type="button" onClick={() => go(index + 1)} className={`${btnPrimary} ml-auto h-11 px-6`}>
                Next
              </button>
            ) : (
              <button type="button" onClick={openReview} className={`${btnPrimary} ml-auto h-11 px-6`}>
                Review Paper
              </button>
            )}
          </div>
        </main>

        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-2xl border border-border bg-card p-5">{navigator}</div>
        </aside>
      </div>

      {zoomed ? <FigureViewer src={zoomed} label={`Figure for question ${current.number}`} onClose={() => setZoomed(null)} /> : null}
    </div>
  );
}
