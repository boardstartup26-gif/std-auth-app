"use client";

// Act 2 — The Evaluation. The money moment: the answer Act 1 watched being
// written gets marked, one scheme point at a time, as the visitor scrolls.
//
// This used to be a pinned, scrubbed stage — scroll position mapped directly
// to reveal progress, with a tap-advanced stepper as the fallback wherever the
// content didn't fit inside one viewport (a phone, or a browser window
// shorter than the finished stage). In practice that fallback fired on
// perfectly ordinary desktop windows — a pin can only ever show content that
// fits in the viewport it freezes, so anything taller than that had nowhere
// to go but the stepper, and "click Next point five times" is not the
// scroll-driven storytelling this act is supposed to be.
//
// This version drops the pin entirely. The answer sticks in place on the left
// (the same sticky-left/scroll-right device Act 1 already uses) while the
// scheme points scroll past on the right; each point gets its own
// ScrollTrigger, and reaching one both reveals its row and sweeps its quote
// in the (still-visible) answer above. Nothing has to fit in one screen
// because nothing is pinned — nothing to measure, no fallback to fall back
// to, and it now behaves identically at every viewport height and on every
// device, including phones. Nothing left that ever shows a "Next point"
// button.
//
// Two things remain load-bearing from the original design:
//
// 1. The data is static and pre-computed (§6 of the handoff). No inference
//    runs inside the scroll animation. It comes from
//    src/lib/data/act2-showcase.json, checked by scripts/validate-showcase.py.
//
// 2. The markup renders complete and correct before any JavaScript runs — the
//    end state is what the server sends: every point visible, every highlight
//    painted, the true final mark on the counter. GSAP rewinds it inside a
//    matchMedia block. A visitor with reduced motion, a script failure, or a
//    page opened in a background tab (where rAF never fires and a trigger
//    that hasn't fired yet just... hasn't fired yet) all read the finished
//    evaluation, never a blank or half-built one.

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { sectionLabel, numericFigures } from "@/lib/ui";
import { SHOWCASE_EVAL } from "@/app/_data/showcase";
import { anchorConceptualError, type MarkingPoint } from "@/lib/history";

gsap.registerPlugin(ScrollTrigger);

const EVAL = SHOWCASE_EVAL;
const POINTS = EVAL.marking_points;

// Same glyph/colour vocabulary as the in-app results page
// (history/[id]/_components/PracticeReport.tsx) — §6's promise is that this
// static file and a live Supabase row render through the identical shape, so
// the landing page should not invent a second visual language for the thing
// it is advertising. "partial" is chrome (a neutral steel tone), not the
// palette's gold: gold read as a bright, alarm-coloured highlight sitting on
// the answer rather than a graded state, so this and the results page were
// both moved off it by direct request.
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
    glyphClass: "text-chrome",
    rowClass: "border-l-2 border-chrome bg-chrome-subtle",
    label: "Partial",
  },
  missed: {
    glyph: "✕",
    glyphClass: "text-status-wrong",
    rowClass: "border-l-2 border-status-wrong bg-status-wrong-subtle",
    label: "Missed",
  },
};

// ─── Answer segmentation ─────────────────────────────────────────────────────

/** What a highlighted run of the answer is standing in for. */
type SegmentRef =
  | { kind: "point"; index: number; status: MarkingPoint["status"] }
  | { kind: "error"; index: number };

interface Segment {
  text: string;
  mark: SegmentRef | null;
}

/**
 * Every conceptual error that can be anchored back into the answer — see
 * anchorConceptualError for what "can" means and why it sometimes can't.
 * Computed once at module scope, same as SEGMENTS below: this is static
 * showcase data, not something that changes per render.
 */
const ERROR_ANCHORS = EVAL.conceptual_errors
  .map((text, index) => ({ index, text, anchor: anchorConceptualError(text, EVAL.student_answer_text) }))
  .filter(
    (e): e is { index: number; text: string; anchor: { start: number; end: number } } => !!e.anchor
  );

/**
 * Split the answer into plain runs and highlighted runs — marking-point
 * quotes and conceptual-error quotes both, merged into one pass so overlaps
 * between the two kinds resolve the same way overlaps within one kind do.
 *
 * Anchors are trusted only as far as they check out: anything out of range,
 * inverted, or overlapping a span already claimed is dropped and its text
 * renders plain. An anchor that disagrees with the text it points into is the
 * failure mode the validator exists to catch — this is the runtime half of
 * that defence, so a bad asset degrades to unhighlighted prose instead of
 * slicing the answer at meaningless offsets.
 */
function segmentAnswer(
  answer: string,
  points: MarkingPoint[],
  errors: typeof ERROR_ANCHORS
): Segment[] {
  const pointSpans = points
    .map((p, index) => ({ anchor: p.anchor, mark: { kind: "point" as const, index, status: p.status } }))
    .filter((s): s is typeof s & { anchor: { start: number; end: number } } => {
      const a = s.anchor;
      return (
        !!a &&
        Number.isInteger(a.start) &&
        Number.isInteger(a.end) &&
        a.start >= 0 &&
        a.end <= answer.length &&
        a.end > a.start
      );
    })
    .map((s) => ({ start: s.anchor.start, end: s.anchor.end, mark: s.mark as SegmentRef }));

  const errorSpans = errors.map((e) => ({
    start: e.anchor.start,
    end: e.anchor.end,
    mark: { kind: "error" as const, index: e.index },
  }));

  const spans = [...pointSpans, ...errorSpans].sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let cursor = 0;

  for (const span of spans) {
    if (span.start < cursor) continue; // overlaps an earlier span — skip it
    if (span.start > cursor) {
      segments.push({ text: answer.slice(cursor, span.start), mark: null });
    }
    segments.push({ text: answer.slice(span.start, span.end), mark: span.mark });
    cursor = span.end;
  }
  if (cursor < answer.length) {
    segments.push({ text: answer.slice(cursor), mark: null });
  }
  return segments;
}

const SEGMENTS = segmentAnswer(EVAL.student_answer_text, POINTS, ERROR_ANCHORS);

/** The data-highlight key a segment's wash is looked up and swept by. */
function highlightKey(mark: SegmentRef): string {
  return mark.kind === "point" ? `p${mark.index}` : `e${mark.index}`;
}

function washFor(mark: SegmentRef): string {
  if (mark.kind === "error") return "bg-status-wrong-wash";
  return mark.status === "partial" ? "bg-chrome-wash" : "bg-awarded-wash";
}

/**
 * One highlighted run of the answer, with a wash that sweeps across it word
 * by word once its ScrollTrigger fires.
 *
 * Word by word because the wash cannot be one box. A quote here is a whole
 * sentence, which wraps — and an absolutely positioned layer inside a wrapped
 * inline element is sized to the *union* of that element's line boxes, not to
 * each line. Each word is its own inline-block instead, so each wash is one
 * line box and lands where the word is; the washes are widened slightly to
 * close the gaps the spaces between them leave, and use the flattened
 * --*-wash tokens so that overlap does not stack into a darker seam at every
 * join.
 */
function HighlightedRun({ text, mark }: { text: string; mark: SegmentRef }) {
  const tokens = text.split(/(\s+)/).filter(Boolean);
  const wash = washFor(mark);
  const key = highlightKey(mark);

  return (
    <>
      {tokens.map((token, i) =>
        /^\s+$/.test(token) ? (
          <span key={i}>{token}</span>
        ) : (
          <span key={i} className="relative isolate inline-block leading-[1.35]">
            <span
              data-highlight={key}
              aria-hidden
              className={`absolute inset-y-0 -inset-x-[0.16em] -z-10 rounded-[2px] ${wash}`}
            />
            {token}
          </span>
        )
      )}
    </>
  );
}

// ─── Steps ───────────────────────────────────────────────────────────────────
//
// One step per marking point, then the conceptual error (if any anchored),
// then the verdict. Each step is its own ScrollTrigger now rather than a
// position on one shared timeline, but the sequence and its indices are
// unchanged, so the marks-counter math below reads the same as before.

const ERROR_STEP = POINTS.length;
const VERDICT_STEP = POINTS.length + 1;

/** Marks awarded by the end of a given step — the counter's value. */
function marksAtStep(step: number): number {
  return POINTS.slice(0, Math.min(step + 1, POINTS.length)).reduce(
    (sum, p) => sum + (p.marks_awarded ?? 0),
    0
  );
}

export function Act2Evaluation() {
  const sectionRef = useRef<HTMLElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const mm = gsap.matchMedia();

    // Reduced motion: the server's end state — every row visible, every wash
    // painted, the true final mark — is already correct. Nothing to do.
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const rows = gsap.utils.toArray<HTMLElement>("[data-step]", section);
      const fills = gsap.utils.toArray<HTMLElement>("[data-highlight]", section);
      const counter = counterRef.current;

      gsap.set(rows, { opacity: 0, y: 16 });
      gsap.set(fills, { scaleX: 0, transformOrigin: "left center" });
      if (counter) counter.textContent = "0";

      // Which fills belong to a given step. Points map 1:1 (step i -> key
      // "pi"); the error step sweeps every anchored error at once, since the
      // callout shows all of them together rather than one at a time; the
      // verdict step carries no highlight of its own.
      const runForStep = (step: number): HTMLElement[] => {
        if (step === VERDICT_STEP) return [];
        if (step === ERROR_STEP) {
          return fills.filter((f) => f.dataset.highlight?.startsWith("e"));
        }
        return fills.filter((f) => f.dataset.highlight === `p${step}`);
      };

      const triggers = rows.map((row) => {
        const step = Number(row.dataset.step);
        const run = runForStep(step);

        return ScrollTrigger.create({
          trigger: row,
          start: "top 82%",
          once: true,
          onEnter: () => {
            gsap.to(row, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" });
            if (run.length) {
              gsap.to(run, {
                scaleX: 1,
                duration: 0.18,
                ease: "power1.inOut",
                delay: 0.08,
                stagger: run.length > 1 ? 0.34 / (run.length - 1) : 0,
              });
            }
            if (step < ERROR_STEP && counter) {
              counter.textContent = String(marksAtStep(step));
            }
          },
        });
      });

      // Fraunces is large enough on this page that a late font swap moves
      // trigger positions by hundreds of pixels; without a refresh, triggers
      // measured against the fallback font fire at the wrong scroll offset.
      let refreshed = false;
      document.fonts?.ready
        .then(() => {
          if (!refreshed) {
            refreshed = true;
            ScrollTrigger.refresh();
          }
        })
        .catch(() => {});

      return () => {
        triggers.forEach((t) => t.kill());
        gsap.set(rows, { clearProps: "all" });
        gsap.set(fills, { clearProps: "all" });
        if (counter) counter.textContent = String(EVAL.marks_awarded);
      };
    });

    return () => mm.revert();
  }, []);

  return (
    <section ref={sectionRef} id="evaluation" className="border-y border-border bg-card/30">
      <div className="mx-auto max-w-7xl px-6 py-24 lg:px-12">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] lg:gap-16">
          {/* Sticky left: running mark total, then the answer itself. Stays in
              view while the points scroll past on the right, so a highlight
              landing in the answer is always visible at the moment its point
              arrives — the same device Act 1 uses for the reverse pairing. */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <p
              className={`font-mono text-4xl leading-none text-foreground ${numericFigures}`}
              aria-live="off"
            >
              {/* Mono, tabular — §2 calls this non-negotiable: proportional
                  figures read as decoration, mono reads as graded. Server
                  renders the true final mark; the effect above counts it back
                  down to 0 only for a visitor who is about to watch it climb
                  again. */}
              <span ref={counterRef}>{EVAL.marks_awarded}</span>
              <span className="text-muted-foreground">/{EVAL.total_marks}</span>
            </p>
            <p className="mt-2 text-xs text-muted-foreground">marks awarded</p>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              {EVAL.board} {EVAL.subject} · {EVAL.year} · Q{EVAL.question_number}
            </p>

            <h2 className="display-section mt-8 max-w-[18ch] text-balance">
              Here is what the scheme actually wanted.
            </h2>

            <div className="mt-6 rounded-lg border border-border bg-background p-4">
              <p className={sectionLabel}>The answer</p>
              {/* transform-gpu is load-bearing, not a perf hint: every
                  HighlightedRun word carries a transformed wash sibling (even
                  before its trigger fires, GSAP sets it to scaleX(0) rather
                  than leaving it untouched), which promotes those words onto a
                  composited layer that Chromium renders with grayscale
                  antialiasing — not the subpixel/ClearType AA a plain text
                  node gets. Applying it to the whole paragraph keeps every
                  sentence in it on the same layer, whether or not it happens
                  to carry a mark. */}
              <p className="mt-2.5 max-w-[var(--measure)] font-display text-[16px] leading-[1.8] text-foreground transform-gpu">
                {SEGMENTS.map((seg, i) =>
                  seg.mark === null ? (
                    <span key={i}>{seg.text}</span>
                  ) : (
                    <HighlightedRun key={i} text={seg.text} mark={seg.mark} />
                  )
                )}
              </p>
            </div>
          </div>

          {/* Scrolling right: one row per scheme point, in scheme order —
              array position is the reveal order (§6), there is no separate
              order field — then the conceptual error, then the verdict. */}
          <div className="min-w-0">
            <ol className="flex flex-col gap-3">
              {POINTS.map((p, i) => {
                const mark = STATUS_MARK[p.status] ?? STATUS_MARK.missed;
                return (
                  <li
                    key={`${p.point}-${i}`}
                    data-step={i}
                    className={`flex items-start gap-3 rounded-r-md px-3 py-2.5 ${mark.rowClass}`}
                  >
                    <span
                      className={`${mark.glyphClass} mt-px w-4 shrink-0 text-center text-base font-semibold`}
                      title={mark.label}
                      aria-hidden
                    >
                      {mark.glyph}
                    </span>
                    <span className="min-w-0 flex-1 text-[14px] leading-snug text-foreground">
                      <span className="sr-only">{mark.label}: </span>
                      {p.point}
                    </span>
                    <span
                      className={`shrink-0 font-mono text-[13px] text-muted-foreground ${numericFigures}`}
                    >
                      {p.marks_awarded}/{p.marks}
                    </span>
                  </li>
                );
              })}
            </ol>

            {/* The conceptual error, in its own treatment — a filled callout
                with a heavy rule — so it reads as a different kind of thing
                from an omission, not just another list row. Its quoted span
                is now also marked red directly in the answer above, so this
                box explains a highlight the reader has already seen land. */}
            {EVAL.conceptual_errors.length > 0 ? (
              <div
                data-step={ERROR_STEP}
                className="mt-4 rounded-r-md border-l-2 border-accent bg-accent-subtle px-4 py-3.5"
              >
                <p className={sectionLabel}>Where the third mark went</p>
                {EVAL.conceptual_errors.map((err) => (
                  <p key={err} className="mt-2 text-[13px] leading-relaxed text-foreground">
                    {err}
                  </p>
                ))}
              </div>
            ) : null}

            <div data-step={VERDICT_STEP} className="mt-6">
              <p className={sectionLabel}>The examiner&apos;s summary</p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {EVAL.examiner_feedback}
              </p>
              <p className="mt-3 text-xs italic text-muted-foreground">
                One real evaluation of one real answer — the same output you get on
                your own.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
