"use client";

// The Practice report — progressive disclosure over one evaluated attempt
// (handoff §8 and §11).
//
// Depth 1 (verdict) is always open; everything below it is collapsed until
// asked for. That ordering is the point: the mark is what a student wants on
// arrival, and the per-point breakdown — the part that actually teaches — is
// worth a deliberate tap rather than a wall of text on load.
//
// No scroll-jacking here, unlike the landing page's Act 2. This is a page
// students revisit; §11 is explicit that the interaction model is disclosure
// only.

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { numericMono, sectionLabel } from "@/lib/ui";
import { sliceAnswer, type MarkingPoint } from "@/lib/history";

export interface PracticeRecord {
  subject: string;
  year: number | null;
  questionNumber: string;
  questionText: string | null;
  answerText: string;
  awarded: number;
  totalMarks: number;
  examinerFeedback: string | null;
  markingPoints: MarkingPoint[];
  pointsAreSynthesised: boolean;
  conceptualErrors: string[];
  modelAnswer: string | null;
  modelAnswerSource: string | null;
  improvementTips: string[];
  isObjective: boolean;
  declaredMarks: number | null;
}

function Depth({
  label,
  count,
  children,
  defaultOpen = false,
}: {
  label: string;
  count?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-t border-border">
      <h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center gap-2 py-4 text-left transition-colors hover:text-accent"
        >
          <ChevronDown
            size={15}
            aria-hidden
            className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
          <span className="text-sm font-semibold text-foreground">{label}</span>
          {count ? (
            <span className={`${numericMono} text-[11px] text-muted-foreground`}>{count}</span>
          ) : null}
        </button>
      </h2>
      {open ? <div className="pb-8">{children}</div> : null}
    </section>
  );
}

/**
 * The student's answer with one marking point's quote highlighted.
 *
 * A null anchor is a normal state, not an error: the model paraphrased instead
 * of quoting verbatim, so `resolveMarkingPointAnchors` could not place the
 * span. The answer still renders in full, just without the highlight.
 */
function AnswerPanel({
  answer,
  active,
}: {
  answer: string;
  active: MarkingPoint | null;
}) {
  const slice = active ? sliceAnswer(answer, active.anchor) : null;
  const wash =
    active?.status === "missed"
      ? "bg-status-wrong-subtle"
      : active?.status === "partial"
      ? "bg-status-partial-subtle"
      : "bg-status-correct-subtle";

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className={sectionLabel}>Your answer</p>
      <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
        {slice ? (
          <>
            {slice.before}
            <mark className={`${wash} rounded-sm px-0.5 text-foreground`}>{slice.match}</mark>
            {slice.after}
          </>
        ) : (
          answer
        )}
      </p>
      {active && !slice ? (
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          This point has no quoted span in your answer, so nothing is highlighted.
        </p>
      ) : null}
    </div>
  );
}

const STATUS_MARK: Record<MarkingPoint["status"], { glyph: string; className: string; label: string }> = {
  // Gold as a glyph, not as prose: withheld on the page ground measures
  // 3.24:1, which clears the 3:1 bar for a non-text mark but not the 4.5:1
  // that body copy needs — so the dash is gold and the wording stays ink.
  awarded: { glyph: "✓", className: "text-status-correct", label: "Awarded" },
  partial: { glyph: "–", className: "text-status-partial", label: "Partial" },
  missed: { glyph: "✕", className: "text-muted-foreground", label: "Missed" },
};

function MarkingPointList({
  points,
  answer,
  synthesised,
}: {
  points: MarkingPoint[];
  answer: string;
  synthesised: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const active = activeIndex === null ? null : points[activeIndex] ?? null;
  const anyAnchors = points.some((p) => p.anchor);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      <ol className="flex flex-col">
        {points.map((p, i) => {
          const mark = STATUS_MARK[p.status] ?? STATUS_MARK.missed;
          const selected = i === activeIndex;
          const selectable = !!p.anchor;
          return (
            <li key={`${p.point}-${i}`} className="border-b border-border last:border-b-0">
              <button
                type="button"
                disabled={!selectable}
                onClick={() => setActiveIndex(selected ? null : i)}
                aria-pressed={selected}
                className={`flex w-full items-start gap-3 px-2 py-3 text-left transition-colors ${
                  selectable ? "cursor-pointer hover:bg-surface-raised" : "cursor-default"
                } ${selected ? "bg-surface-raised" : ""}`}
              >
                <span
                  className={`${mark.className} mt-0.5 w-4 shrink-0 text-center text-sm`}
                  title={mark.label}
                >
                  {mark.glyph}
                  <span className="sr-only">{mark.label}: </span>
                </span>
                <span
                  className={`min-w-0 flex-1 text-[14px] leading-snug ${
                    p.status === "missed"
                      ? "text-muted-foreground line-through decoration-border"
                      : "text-foreground"
                  }`}
                >
                  {p.point}
                </span>
                {p.marks > 0 ? (
                  <span className={`${numericMono} shrink-0 text-xs text-muted-foreground`}>
                    {p.marks_awarded}/{p.marks}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="lg:sticky lg:top-12">
        <AnswerPanel answer={answer} active={active} />
        <p className="mt-2 text-[11px] text-muted-foreground">
          {synthesised
            ? "This evaluation predates per-point marking, so points show as awarded or missed only, without quoted spans."
            : anyAnchors
            ? "Tap a point to highlight the exact words it was matched against."
            : "No point in this evaluation carries a quoted span, so there is nothing to highlight."}
        </p>
      </div>
    </div>
  );
}

export function PracticeReport({ record }: { record: PracticeRecord }) {
  const {
    markingPoints,
    conceptualErrors,
    modelAnswer,
    improvementTips,
    isObjective,
    answerText,
  } = record;

  const awardedCount = markingPoints.filter((p) => p.status !== "missed").length;

  return (
    <div className="mt-8">
      {/* ── Depth 1 — verdict. Never collapsed. ─────────────────────────── */}
      <section className="border-t border-border pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <p className={sectionLabel}>Verdict</p>
          {record.declaredMarks != null ? (
            <p className={`${numericMono} text-[11px] text-muted-foreground`}>
              You predicted {record.declaredMarks}
            </p>
          ) : null}
        </div>
        <p className="mt-3 max-w-[var(--measure)] text-[15px] leading-relaxed text-foreground">
          {record.examinerFeedback?.trim() || "No examiner comment was recorded for this attempt."}
        </p>
      </section>

      {/* ── Depth 2 — the marking points ────────────────────────────────── */}
      {isObjective ? null : markingPoints.length ? (
        <Depth
          label="Marking points"
          count={`${awardedCount}/${markingPoints.length} credited`}
        >
          <MarkingPointList
            points={markingPoints}
            answer={answerText}
            synthesised={record.pointsAreSynthesised}
          />
        </Depth>
      ) : (
        <Depth label="Marking points">
          <p className="text-sm text-muted-foreground">
            No per-point breakdown was recorded for this attempt.
          </p>
          <div className="mt-4">
            <AnswerPanel answer={answerText} active={null} />
          </div>
        </Depth>
      )}

      {/* Objective questions have a single point and no list worth opening —
          §11 says show the answer itself at Depth 1 instead. */}
      {isObjective ? (
        <Depth label="Your answer" defaultOpen>
          <AnswerPanel answer={answerText} active={null} />
        </Depth>
      ) : null}

      {/* ── Depth 3 — flagged errors. Accent, because a wrong statement is
             not the same thing as an omission. ─────────────────────────── */}
      {conceptualErrors.length > 0 ? (
        <Depth label="Flagged errors" count={String(conceptualErrors.length)}>
          <ul className="flex flex-col gap-3">
            {conceptualErrors.map((e, i) => (
              <li
                key={i}
                className="border-l-2 border-accent bg-accent-subtle px-4 py-3 text-[14px] leading-relaxed text-foreground"
              >
                {e}
              </li>
            ))}
          </ul>
        </Depth>
      ) : null}

      {/* ── Depth 4 — model answer and next steps ───────────────────────── */}
      {modelAnswer || improvementTips.length ? (
        <Depth label="Model answer and next steps">
          {modelAnswer ? (
            <figure className="m-0">
              <figcaption className="flex flex-wrap items-center gap-2">
                <span className={sectionLabel}>Model answer</span>
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  {record.modelAnswerSource === "verified" ? "CISCE verified" : "AI generated"}
                </span>
              </figcaption>
              {/* Margin-note treatment per §11: Fraunces, smaller, ink-muted —
                  it is a reference beside the student's work, not a correction
                  stamped over it. */}
              <blockquote className="mt-3 max-w-[var(--measure)] border-l border-rule pl-5">
                <p className="display-section m-0 whitespace-pre-wrap text-[17px] leading-relaxed text-muted-foreground">
                  {modelAnswer}
                </p>
              </blockquote>
            </figure>
          ) : null}

          {improvementTips.length ? (
            <div className={modelAnswer ? "mt-8" : ""}>
              <p className={sectionLabel}>Next time</p>
              <ul className="mt-3 flex max-w-[var(--measure)] flex-col gap-2">
                {improvementTips.map((tip, i) => (
                  <li key={i} className="flex gap-3 text-[14px] leading-relaxed text-foreground">
                    <span className={`${numericMono} shrink-0 text-muted-foreground`}>
                      {i + 1}.
                    </span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Depth>
      ) : null}

      <div className="border-t border-border" />
    </div>
  );
}
