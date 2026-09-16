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
import { numericFigures, sectionLabel } from "@/lib/ui";
import { sliceAnswer, type MarkingPoint } from "@/lib/history";
import { TapSweepHighlight } from "@/app/_components/TapSweepHighlight";

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
            <span className={`${numericFigures} text-[11px] text-muted-foreground`}>{count}</span>
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
  // Missed stays on its existing translucent token — a missed point carries
  // no matched_text by construction (§6), so this branch is defensive rather
  // than reachable, and doesn't warrant a third flattened wash token for a
  // case the data model doesn't produce.
  const wash =
    active?.status === "missed"
      ? "bg-status-wrong-subtle"
      : active?.status === "partial"
      ? "bg-withheld-wash"
      : "bg-awarded-wash";

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className={sectionLabel}>Your answer</p>
      {/* transform-gpu unconditionally, not just when a point is active: the
          highlighted span's words each carry a transformed wash sibling
          (promoting them onto a composited layer, which Chromium renders with
          grayscale antialiasing), while the surrounding before/after text
          would stay on the default subpixel/ClearType path — the exact
          mismatch Act2Evaluation's answer paragraph hit and fixed the same
          way. Applying it here whether or not a point is selected keeps every
          render of this paragraph on one layer, not just the ones with a
          highlight in them. */}
      <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground transform-gpu">
        {slice ? (
          <>
            {slice.before}
            <mark className="rounded-sm px-0.5 text-foreground">
              <TapSweepHighlight text={slice.match} wash={wash} />
            </mark>
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

// Each status carries its colour on three things at once — the glyph, a left
// rule, and a wash — because a coloured glyph alone disappears at this size:
// the list read as a column of grey text with grey marks, which is exactly
// what a student scanning for "what did I lose" cannot use.
//
// Colour never lands on the point's own wording. Awarded green is 6.44:1 and
// would be fine, but withheld gold on its own wash is 2.79:1, so a rule that
// coloured the text would have to make an exception for one status and would
// stop being a rule. The glyph and the rule are non-text UI at 3:1; the
// sentence stays ink at 15.31:1 in every row.
//
// §11 reserves accent for conceptual errors and asks for a muted "missed".
// A muted miss is what the grey complaint was about, so missed takes the red
// here and the conceptual-error block keeps its distinction by treatment — a
// filled callout with a heavy rule — rather than by hue alone.
const STATUS_MARK: Record<
  MarkingPoint["status"],
  { glyph: string; glyphClass: string; rowClass: string; label: string }
> = {
  awarded: {
    glyph: "✓",
    glyphClass: "text-status-correct",
    rowClass: "border-l-2 border-status-correct bg-status-correct-subtle",
    label: "Awarded",
  },
  partial: {
    glyph: "–",
    glyphClass: "text-status-partial",
    rowClass: "border-l-2 border-status-partial bg-status-partial-subtle",
    label: "Partial",
  },
  missed: {
    glyph: "✕",
    glyphClass: "text-status-wrong",
    rowClass: "border-l-2 border-status-wrong bg-status-wrong-subtle",
    label: "Missed",
  },
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
            <li key={`${p.point}-${i}`} className="mb-2 last:mb-0">
              <button
                type="button"
                disabled={!selectable}
                onClick={() => setActiveIndex(selected ? null : i)}
                aria-pressed={selected}
                className={`flex w-full items-start gap-3 rounded-r-md px-3 py-3 text-left transition-shadow ${mark.rowClass} ${
                  selectable ? "cursor-pointer" : "cursor-default"
                } ${selected ? "ring-1 ring-inset ring-foreground/25" : ""}`}
              >
                <span
                  className={`${mark.glyphClass} mt-px w-4 shrink-0 text-center text-base font-semibold`}
                  title={mark.label}
                >
                  {mark.glyph}
                  <span className="sr-only">{mark.label}: </span>
                </span>
                <span className="min-w-0 flex-1 text-[14px] leading-snug text-foreground">
                  {p.point}
                </span>
                {p.marks > 0 ? (
                  <span className={`${numericFigures} shrink-0 text-xs font-semibold text-foreground`}>
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
            <p className={`${numericFigures} text-[11px] text-muted-foreground`}>
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
                  stamped over it. `font-display` (family only, from the
                  --font-display theme token) rather than `.display-section`:
                  that class also carries font-size: var(--text-section), a
                  clamp(2rem, 4vw, 3.25rem) section-heading size defined
                  outside any @layer, so it silently overrode the text-[17px]
                  utility below regardless of source order — unlayered CSS
                  beats @layer utilities in the cascade. The model answer was
                  rendering at heading scale. */}
              <blockquote className="mt-3 max-w-[var(--measure)] border-l border-rule pl-5">
                <p className="font-display m-0 whitespace-pre-wrap text-[17px] leading-relaxed text-muted-foreground">
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
                    <span className={`${numericFigures} shrink-0 text-muted-foreground`}>
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
