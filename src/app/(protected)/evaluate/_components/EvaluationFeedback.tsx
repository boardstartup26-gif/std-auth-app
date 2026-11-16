"use client";

// The feedback shown after one answer is marked on /evaluate: summary with the
// marks ring, Strengths / Gaps / Next correction, the deductions row by row,
// the model answer, the examiner tip, then the two ways forward.
//
// Presentation only. Everything it shows comes from buildFeedbackView(), which
// derives it from the evaluate API response — nothing here calls a model or
// invents a mark. The page owns the workflow (resubmitting, picking the next
// question) and passes it in as callbacks.

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  CircleAlert,
  GraduationCap,
  Layers,
  Sparkles,
  Target,
} from "lucide-react";
import { Skeleton } from "@/app/_components/states/Skeleton";
import { BookStackSketch, HallSketch } from "@/app/(protected)/dashboard/_components/Illustrations";
import { buildFeedbackView, formatMarks, type FeedbackSource, type GapItem, type LostRow } from "../_lib/feedback";

const card = "rounded-2xl border shadow-[0_1px_2px_rgb(22_24_29/0.04)]";
const heading = "font-display font-semibold tracking-[-0.01em]";
const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.2em]";
// Flat tints over the white surface — the reference's washes without gradients.
const tint = {
  accent: "bg-[color-mix(in_srgb,var(--accent)_5%,var(--surface))] border-accent/20",
  awarded: "bg-[color-mix(in_srgb,var(--awarded)_6%,var(--surface))] border-awarded/25",
  withheld: "bg-[color-mix(in_srgb,var(--withheld)_8%,var(--surface))] border-withheld/30",
};

// Gold fails contrast as text on paper, so its ink is the token deepened toward
// --ink rather than a new hex.
const goldInk = "text-[color-mix(in_srgb,var(--withheld)_62%,var(--ink))]";
const goldDot = "bg-[color-mix(in_srgb,var(--withheld)_62%,var(--ink))]";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// ─── Marks ring ──────────────────────────────────────────────────────────────

function MarksRing({ awarded, total }: { awarded: number; total: number }) {
  const r = 62;
  const c = 2 * Math.PI * r;
  const share = total > 0 ? Math.max(0, Math.min(1, awarded / total)) : 0;
  return (
    <div
      className="relative h-36 w-36 shrink-0 sm:h-44 sm:w-44"
      role="img"
      aria-label={`${formatMarks(awarded)} out of ${formatMarks(total)} marks`}
    >
      <svg viewBox="0 0 150 150" className="h-full w-full -rotate-90" aria-hidden focusable="false">
        <circle cx="75" cy="75" r={r} fill="none" stroke="color-mix(in srgb, var(--accent) 14%, var(--surface))" strokeWidth="9" />
        {share > 0 ? (
          <circle
            cx="75"
            cy="75"
            r={r}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${share * c} ${c}`}
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center" aria-hidden>
        <p className="font-display leading-none text-foreground tabular-nums">
          <span className="text-[2.6rem] font-semibold sm:text-[3.1rem]">{formatMarks(awarded)}</span>
          <span className="text-[1.5rem] text-foreground/80 sm:text-[1.8rem]"> / {formatMarks(total)}</span>
        </p>
        <p className={`${eyebrow} mt-2 text-foreground/80`}>Marks</p>
      </div>
    </div>
  );
}

// ─── Three overview panels ───────────────────────────────────────────────────

function Panel({
  tone,
  icon,
  title,
  children,
}: {
  tone: keyof typeof tint;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  const ink = tone === "awarded" ? "text-status-correct" : tone === "withheld" ? goldInk : "text-accent";
  return (
    <section className={`${card} ${tint[tone]} p-5 sm:p-6`}>
      <h3 className={`${heading} flex items-center gap-3 text-[1.35rem] ${ink}`}>
        {icon}
        {title}
      </h3>
      <div className="mt-4 text-[14px] leading-relaxed text-foreground/90">{children}</div>
    </section>
  );
}

function Bullets({ items, dot }: { items: React.ReactNode[]; dot: string }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="grid grid-cols-[0.5rem_minmax(0,1fr)] gap-x-3">
          <span aria-hidden className={`mt-[0.6em] h-1.5 w-1.5 rounded-full ${dot}`} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

const GAP_LABEL: Record<GapItem["kind"], string> = {
  conceptual: "Concept",
  style: "Exam style",
  unassessable: "Not assessed",
};

// ─── Why you lost marks ──────────────────────────────────────────────────────

function LostMarkRow({ row }: { row: LostRow }) {
  const [open, setOpen] = useState(false);
  const partial = row.status === "partial";
  const panelId = `fix-${row.key}`;

  return (
    <li className={`${card} border-border bg-card`}>
      <div className="grid items-center gap-x-5 gap-y-3 px-4 py-4 sm:px-6 md:grid-cols-[auto_minmax(0,16.5rem)_minmax(0,1fr)_auto]">
        <div className="flex items-center gap-4 md:contents">
          <span
            className={`grid h-9 min-w-[3.25rem] shrink-0 place-items-center rounded-lg px-2 font-display text-lg font-semibold tabular-nums ${
              row.lost === null ? "bg-chrome-subtle text-muted-foreground" : "bg-accent-subtle text-accent"
            }`}
          >
            {row.lost === null ? "—" : `−${formatMarks(row.lost)}`}
            <span className="sr-only">{row.lost === null ? "marks not recorded" : " marks"}</span>
          </span>
          <div className="min-w-0 md:border-l md:border-border md:pl-5">
            <p className={`${heading} text-[1.1rem] leading-snug text-foreground`}>
              {partial ? "Point only partly made" : "Marking point missed"}
            </p>
            <p className={`${eyebrow} mt-1 text-muted-foreground tabular-nums`}>
              Marking point
              {row.of !== null ? ` · ${partial ? `${formatMarks(row.got ?? 0)} of ` : ""}${plural(row.of, "mark", "marks")}` : ""}
            </p>
          </div>
        </div>
        <p className="text-[14px] leading-relaxed text-foreground/90">{row.point}</p>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-9 items-center gap-2 justify-self-start rounded-full border border-accent/30 bg-card px-4 text-[13px] font-medium text-accent transition-colors hover:bg-accent-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:justify-self-end"
        >
          How to fix
          <ChevronDown size={15} aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open ? (
        <div id={panelId} className="space-y-3 border-t border-border px-4 py-4 text-[14px] leading-relaxed text-foreground/90 sm:px-6">
          {row.quote ? (
            <p>
              <span className="font-medium text-foreground">You wrote:</span> &ldquo;{row.quote}&rdquo;
              {row.got !== null && row.of !== null ? (
                <span className="text-muted-foreground tabular-nums">
                  {" "}
                  — worth {formatMarks(row.got)} of {plural(row.of, "mark", "marks")}. Complete the point to earn the rest.
                </span>
              ) : null}
            </p>
          ) : null}
          {row.modelExcerpt ? (
            <div>
              <p className="font-medium text-foreground">How a full-mark answer covers it:</p>
              <p className="mt-1.5 border-l-2 border-awarded/50 pl-3 font-display text-[15px] text-foreground">{row.modelExcerpt}</p>
            </div>
          ) : (
            <p>
              State this point explicitly in your answer, in the scheme&rsquo;s own terms. The model answer below shows it in
              context.
            </p>
          )}
        </div>
      ) : null}
    </li>
  );
}

// ─── The view ────────────────────────────────────────────────────────────────

export interface FeedbackResult extends FeedbackSource {
  token_cost?: number;
  tokens_remaining?: number;
}

export function EvaluationFeedback({
  result,
  questionLabel,
  studentAnswer,
  onRetry,
  retryCost,
  similar,
  children,
}: {
  result: FeedbackResult;
  /** e.g. "Question 4(b)" — from the selected question, never from the answer. */
  questionLabel: string;
  studentAnswer: string;
  /** Omitted when rewriting can't teach anything (objective answers). */
  onRetry?: () => void;
  retryCost?: number;
  similar: { label: string; note: string | null; onClick: () => void };
  /** Existing page blocks shown after the actions (share, rate this evaluation). */
  children?: React.ReactNode;
}) {
  const view = useMemo(() => buildFeedbackView(result, studentAnswer), [result, studentAnswer]);
  const objective = Boolean(result.is_objective);
  const { counts } = view;
  const total = formatMarks(result.total_marks);
  // False when the response carried no per-point data at all. The panels then
  // say the breakdown is missing, rather than "nothing awarded" or "no gaps",
  // either of which would contradict the marks above them.
  const hasBreakdown = view.strengths.length + view.lostRows.length > 0;

  return (
    <div className="font-body">
      {/* ─── Summary ─────────────────────────────────────────────────── */}
      <section
        className={`${card} ${tint.accent} relative overflow-hidden px-5 py-6 shadow-[0_2px_10px_rgb(22_24_29/0.06)] sm:px-8 sm:py-7`}
        aria-labelledby="feedback-verdict"
      >
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
          <MarksRing awarded={result.marks_awarded} total={result.total_marks} />
          <div className="min-w-0 flex-1 text-center sm:border-l sm:border-accent/20 sm:pl-8 sm:text-left lg:pr-48">
            <p className={`${eyebrow} text-foreground/80`}>
              {questionLabel} — {objective ? "Result" : "Evaluation feedback"}
            </p>
            <h2 id="feedback-verdict" className={`${heading} mt-2.5 text-[1.6rem] leading-[1.15] text-foreground text-balance sm:text-[2rem]`}>
              {view.verdict}
            </h2>
            {objective ? (
              !result.is_correct && result.correct_answer ? (
                <p className="mt-3 text-[15px] leading-relaxed text-foreground/85">
                  Correct answer: <span className="font-semibold text-foreground">{result.correct_answer}</span>
                </p>
              ) : null
            ) : result.examiner_feedback?.trim() ? (
              <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-foreground/85">{result.examiner_feedback.trim()}</p>
            ) : null}

            {!objective && (counts.awarded || counts.partial || counts.missed) ? (
              <ul className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
                {counts.awarded ? (
                  <li className="inline-flex items-center gap-2 rounded-full border border-awarded/30 bg-awarded-subtle px-3.5 py-1.5 text-[13px] font-medium text-foreground">
                    <Check size={15} strokeWidth={2.5} aria-hidden className="text-status-correct" />
                    {plural(counts.awarded, "marking point", "marking points")} awarded
                  </li>
                ) : null}
                {counts.partial ? (
                  <li className="inline-flex items-center gap-2 rounded-full border border-withheld/40 bg-withheld-subtle px-3.5 py-1.5 text-[13px] font-medium text-foreground">
                    <AlertTriangle size={14} aria-hidden className={goldInk} />
                    {counts.partial} only partly made
                  </li>
                ) : null}
                {counts.missed ? (
                  <li className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent-subtle px-3.5 py-1.5 text-[13px] font-medium text-foreground">
                    <CircleAlert size={15} aria-hidden className="text-accent" />
                    {plural(counts.missed, "marking point", "marking points")} missed
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
        </div>
        <BookStackSketch className="pointer-events-none absolute -bottom-2 right-4 hidden w-44 text-accent/50 lg:block" />
      </section>

      {!objective ? (
        <>
          {/* ─── Strengths / Gaps / Next correction ──────────────────── */}
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <Panel tone="awarded" title="Strengths" icon={<Check size={22} strokeWidth={2.5} aria-hidden />}>
              {view.strengths.length ? (
                <Bullets items={view.strengths} dot="bg-status-correct" />
              ) : (
                <p className="text-muted-foreground">
                  {!hasBreakdown
                    ? "A point-by-point breakdown wasn’t returned for this answer."
                    : counts.partial
                      ? "No marking point was awarded in full — the ones you partly made are itemised below."
                      : "No marking points were awarded on this attempt."}
                </p>
              )}
            </Panel>

            <Panel
              tone="withheld"
              title="Gaps"
              icon={<AlertTriangle size={22} aria-hidden />}
            >
              {view.lostRows.length ? (
                <p className="tabular-nums">
                  {[
                    counts.missed ? `${plural(counts.missed, "marking point", "marking points")} missed` : null,
                    counts.partial ? `${counts.partial} only partly made` : null,
                  ]
                    .filter(Boolean)
                    .join(", ")}{" "}
                  — itemised {view.lostRows.some((r) => r.lost !== null) ? "with their deductions " : ""}below.
                </p>
              ) : !view.gaps.length ? (
                <p className="text-muted-foreground">
                  {view.band === "full" || (hasBreakdown && result.marks_awarded >= result.total_marks)
                    ? "No gaps found — every marking point was awarded."
                    : hasBreakdown
                      ? "No specific gaps were recorded for this answer."
                      : "The marking points you lost weren’t itemised for this answer."}
                </p>
              ) : null}
              {view.gaps.length ? (
                <div className={view.lostRows.length ? "mt-3" : ""}>
                  <Bullets
                    dot={goldDot}
                    items={view.gaps.map((g) => (
                      <>
                        <span className="font-semibold text-foreground">{GAP_LABEL[g.kind]}:</span> {g.text}
                      </>
                    ))}
                  />
                </div>
              ) : null}
            </Panel>

            <Panel
              tone="accent"
              title={view.band === "full" ? "Stretch further" : "Next correction"}
              icon={<Target size={22} aria-hidden />}
            >
              {view.nextCorrections.length ? (
                <Bullets items={view.nextCorrections} dot="bg-accent" />
              ) : (
                <p className="text-muted-foreground">
                  {view.lostRows.length
                    ? "Rework the marking points itemised below, then try the question again."
                    : "No corrections were suggested for this answer."}
                </p>
              )}
            </Panel>
          </div>

          {/* ─── Why you lost marks ──────────────────────────────────── */}
          {view.lostRows.length ? (
            <section className="mt-9" aria-labelledby="why-lost">
              <h3 id="why-lost" className={`${heading} text-[1.75rem] leading-tight text-foreground`}>
                Why you lost marks
              </h3>
              <p className="mt-1 text-[14px] text-muted-foreground">
                The marking points you didn&rsquo;t fully meet, with what each one cost and how to fix it.
              </p>
              <ul className="mt-4 space-y-3">
                {view.lostRows.map((row) => (
                  <LostMarkRow key={row.key} row={row} />
                ))}
              </ul>
            </section>
          ) : null}

          {/* ─── Model answer ────────────────────────────────────────── */}
          {view.modelSegments.length ? (
            <section className={`${card} ${tint.awarded} mt-6 px-5 py-5 sm:px-8 sm:py-6`} aria-labelledby="model-answer">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-awarded/20 pb-4">
                <h3 id="model-answer" className={`${heading} flex items-center gap-3 text-[1.5rem] text-status-correct`}>
                  <BookOpen size={26} strokeWidth={1.6} aria-hidden />
                  Model answer
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                    {result.model_answer_source === "verified" ? "CISCE verified" : "AI generated"}
                  </span>
                  <span className={`${eyebrow} rounded-full bg-awarded-subtle px-3 py-1.5 text-status-correct tabular-nums`}>
                    Full-mark ({total}/{total}) answer
                  </span>
                </div>
              </div>
              <p className="mt-4 whitespace-pre-line font-display text-[1.1rem] leading-[1.7] text-foreground">
                {view.modelSegments.map((seg, i) =>
                  seg.mark ? (
                    <mark key={i} className="rounded-[3px] bg-awarded-subtle box-decoration-clone px-0.5 py-0.5 font-semibold text-foreground">
                      {seg.text}
                    </mark>
                  ) : (
                    <span key={i}>{seg.text}</span>
                  ),
                )}
              </p>
              {view.hasHighlights ? (
                <p className="mt-3 text-[12px] text-muted-foreground">
                  Highlighted: terms from the marking points you lost marks on that your answer didn&rsquo;t use.
                </p>
              ) : null}
            </section>
          ) : null}

          {/* ─── Examiner tip ────────────────────────────────────────── */}
          {view.examinerTip ? (
            <section
              className={`${card} ${tint.accent} relative mt-6 flex flex-col gap-3 overflow-hidden px-5 py-5 sm:flex-row sm:items-center sm:gap-6 sm:px-8`}
              aria-labelledby="examiner-tip"
            >
              <h3 id="examiner-tip" className={`${heading} flex shrink-0 items-center gap-3 text-[1.4rem] text-accent`}>
                <GraduationCap size={28} strokeWidth={1.5} aria-hidden />
                Examiner tip
              </h3>
              <p className="min-w-0 flex-1 text-[14.5px] italic leading-relaxed text-foreground/85 sm:border-l sm:border-accent/25 sm:pl-6 lg:pr-40">
                {view.examinerTip}
              </p>
              <HallSketch className="pointer-events-none absolute -bottom-3 right-3 hidden w-36 text-accent/40 lg:block" />
            </section>
          ) : null}
        </>
      ) : null}

      {/* ─── Actions ─────────────────────────────────────────────────── */}
      <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-start">
        {onRetry ? (
          <div className="text-center">
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex w-full items-center justify-center gap-3 rounded-xl bg-accent px-8 py-3.5 font-display text-[1.15rem] font-semibold text-background shadow-[0_2px_6px_rgb(22_24_29/0.12)] transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto sm:min-w-[19rem]"
            >
              <Sparkles size={20} aria-hidden />
              Retry with guidance
            </button>
            {retryCost ? (
              <p className="mt-1.5 text-[12px] text-muted-foreground tabular-nums">
                Revise your answer and resubmit · {plural(retryCost, "credit", "credits")}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="text-center">
          <button
            type="button"
            onClick={similar.onClick}
            className="inline-flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-card px-8 py-3.5 font-display text-[1.15rem] font-semibold text-foreground shadow-[0_1px_2px_rgb(22_24_29/0.05)] transition-colors hover:border-accent/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto sm:min-w-[19rem]"
          >
            <Layers size={20} aria-hidden />
            {similar.label}
          </button>
          {similar.note ? <p className="mt-1.5 text-[12px] text-muted-foreground">{similar.note}</p> : null}
        </div>
      </div>

      {typeof result.token_cost === "number" && typeof result.tokens_remaining === "number" ? (
        <p className="mt-5 text-center text-xs text-muted-foreground tabular-nums">
          {plural(result.token_cost, "credit", "credits")} used · {result.tokens_remaining} remaining
        </p>
      ) : null}

      {children}
    </div>
  );
}

// ─── Loading ─────────────────────────────────────────────────────────────────
// Shown in the result slot while an answer is being marked, in the feedback's
// own shape, so the swap to the real thing moves nothing.

export function EvaluationFeedbackSkeleton() {
  return (
    <div role="status" aria-label="Marking your answer" className="font-body">
      <div className={`${card} ${tint.accent} flex flex-col items-center gap-6 px-5 py-6 sm:flex-row sm:gap-8 sm:px-8 sm:py-7`} aria-hidden>
        <Skeleton className="h-36 w-36 rounded-full sm:h-44 sm:w-44" />
        <div className="w-full flex-1 space-y-3">
          <Skeleton className="h-3 w-56 max-w-full" />
          <Skeleton className="h-8 w-full max-w-lg" />
          <Skeleton className="h-4 w-full max-w-xl" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${card} border-border bg-card space-y-3 p-5 sm:p-6`}>
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">Marking your answer point by point…</p>
    </div>
  );
}
