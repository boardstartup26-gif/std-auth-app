"use client";

// Act 2 — The Evaluation. The money moment (handoff §5): the answer Act 1
// watched being written gets marked, one scheme point at a time, scrubbed to
// scroll inside a pinned stage.
//
// Three things are load-bearing here.
//
// 1. The data is static and pre-computed (§6). No inference runs inside the
//    scroll animation — runtime latency variance would desync the highlight
//    from scroll position, and a marketing page should not be able to show a
//    spinner mid-scroll. It comes from src/lib/data/act2-showcase.json, the
//    real stored evaluation, checked by scripts/validate-showcase.py.
//
// 2. The markup renders complete and correct before any JavaScript runs. The
//    end state is what the server sends: every point visible, every highlight
//    painted, the true 2/3 on the counter. GSAP then *rewinds* it to the start
//    inside a matchMedia block. A visitor on a phone, with reduced motion, with
//    a script failure, or on a page opened in a background tab (where rAF never
//    fires and a timeline sits frozen at t=0) reads the finished evaluation
//    rather than a blank stage. Nothing is hidden by CSS that JS must undo.
//
// 3. Per §4 the pin and scrub are desktop/tablet only — the device profile is
//    mid-range Android, where pinning a full-height section is the single most
//    expensive thing on the page. Below 768px it degrades to a tap-advanced
//    stepper: no pin, no scrub, no scroll-jacking.

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { sectionLabel, numericFigures } from "@/lib/ui";
import { SHOWCASE_EVAL } from "@/app/_data/showcase";
import type { MarkingPoint } from "@/lib/history";

gsap.registerPlugin(ScrollTrigger);

const EVAL = SHOWCASE_EVAL;
const POINTS = EVAL.marking_points;

// Same glyph/colour vocabulary as the in-app results page
// (history/[id]/_components/PracticeReport.tsx). §6's promise is that this
// static file and a live Supabase row render through the identical shape —
// the landing page should not invent a second visual language for the thing it
// is advertising.
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

// ─── Answer segmentation ─────────────────────────────────────────────────────

interface Segment {
  text: string;
  /** Index into POINTS, or null for the prose between highlights. */
  pointIndex: number | null;
}

/**
 * Split the answer into plain runs and highlighted runs.
 *
 * Anchors are trusted only as far as they check out: anything out of range,
 * inverted, or overlapping a span already claimed is dropped and its text
 * renders plain. An anchor that disagrees with the text it points into is the
 * failure mode the validator exists to catch — this is the runtime half of the
 * same defence, so a bad asset degrades to unhighlighted prose instead of
 * slicing the answer at meaningless offsets.
 */
function segmentAnswer(answer: string, points: MarkingPoint[]): Segment[] {
  const spans = points
    .map((p, pointIndex) => ({ ...p.anchor, pointIndex }))
    .filter(
      (s): s is { start: number; end: number; pointIndex: number } =>
        Number.isInteger(s.start) &&
        Number.isInteger(s.end) &&
        (s.start as number) >= 0 &&
        (s.end as number) <= answer.length &&
        (s.end as number) > (s.start as number)
    )
    .sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let cursor = 0;

  for (const span of spans) {
    if (span.start < cursor) continue; // overlaps an earlier span — skip it
    if (span.start > cursor) {
      segments.push({ text: answer.slice(cursor, span.start), pointIndex: null });
    }
    segments.push({ text: answer.slice(span.start, span.end), pointIndex: span.pointIndex });
    cursor = span.end;
  }
  if (cursor < answer.length) {
    segments.push({ text: answer.slice(cursor), pointIndex: null });
  }
  return segments;
}

const SEGMENTS = segmentAnswer(EVAL.student_answer_text, POINTS);

/**
 * One marking point's quote, with a wash that sweeps across it word by word.
 *
 * Word by word because the wash cannot be one box. A quote here is a whole
 * sentence, which wraps — and an absolutely positioned layer inside a wrapped
 * inline element is sized to the *union* of that element's line boxes, not to
 * each line. The first version did exactly that and painted a grey rectangle
 * across the whole paragraph with a stray bar hanging off it.
 *
 * Each word is its own inline-block, so each wash is one line box and lands
 * where the word is. The spaces stay outside the boxes, which is what keeps
 * the sentence able to wrap at all; the washes are widened slightly to close
 * the gaps those spaces leave, and use the flattened --*-wash tokens so the
 * overlap that creates does not stack into a darker seam at every join.
 *
 * The tighter line-height is on the boxes only: at the paragraph's 1.8 the
 * wash would be nearly twice the height of the text it sits behind and would
 * touch the line above.
 */
function HighlightedRun({
  text,
  pointIndex,
  status,
  swept,
}: {
  text: string;
  pointIndex: number;
  status: MarkingPoint["status"];
  /**
   * Whether this quote's point has been reached — but only meaningful while
   * the tap stepper is driving. `null` means nobody is stepping: the desktop
   * scrub owns these transforms through GSAP, and the server renders them
   * already swept for everyone else.
   */
  swept: boolean | null;
}) {
  // Split on whitespace but keep it: the separators render as ordinary text
  // between the boxes, which is where the line is allowed to break.
  const tokens = text.split(/(\s+)/).filter(Boolean);
  const wash = status === "partial" ? "bg-withheld-wash" : "bg-awarded-wash";

  // Each token paired with its position among the *words* — spaces get null.
  // Counted up front rather than with a running variable inside the map: a
  // counter reassigned across render closures is exactly what the React
  // Compiler refuses, and the sentence is forty tokens, so the repeated scan
  // costs nothing.
  const isSpace = (t: string) => /^\s+$/.test(t);
  const wordCount = tokens.filter((t) => !isSpace(t)).length;
  const parts = tokens.map((token, i) => ({
    token,
    word: isSpace(token) ? null : tokens.slice(0, i).filter((t) => !isSpace(t)).length,
  }));

  return (
    <>
      {parts.map(({ token, word }, i) => {
        if (word === null) return <span key={i}>{token}</span>;

        // The stepper's version of the desktop sweep: each word's wash takes
        // the same 200ms, starting a little later the further along the
        // sentence it sits, so a tap draws the highlight left to right instead
        // of dropping it in all at once. Inline style because the delay is a
        // computed per-word value no utility class can express — and applied
        // only while stepping, so it never fights the inline transform GSAP
        // writes during the desktop scrub.
        const stepping = swept !== null;
        const style = stepping
          ? {
              transform: swept ? "scaleX(1)" : "scaleX(0)",
              transitionDelay: swept
                ? `${Math.round((word / Math.max(1, wordCount - 1)) * 340)}ms`
                : "0ms",
            }
          : undefined;

        return (
          <span key={i} className="relative isolate inline-block leading-[1.35]">
            <span
              data-highlight={pointIndex}
              aria-hidden
              style={style}
              className={`absolute inset-y-0 -inset-x-[0.16em] -z-10 origin-left rounded-[2px] ${wash} ${
                stepping
                  ? "transition-transform duration-200 ease-out motion-reduce:transition-none"
                  : ""
              }`}
            />
            {token}
          </span>
        );
      })}
    </>
  );
}

// ─── Steps ───────────────────────────────────────────────────────────────────
//
// One step per marking point, then the conceptual error, then the verdict.
// The step index is what the mobile stepper walks and what the desktop scrub
// interpolates between — one description of the sequence, two ways to move
// through it.

const STEP_COUNT = POINTS.length + 2;
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
  const stageRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);

  // `null` means "not being stepped through" — the server render, reduced
  // motion, and the desktop scrub all leave every step visible and let GSAP
  // (or nothing at all) decide what shows. Only the mobile stepper sets it.
  const [mobileStep, setMobileStep] = useState<number | null>(null);

  // -1 is "nothing marked yet", the state the desktop scrub also starts in:
  // the answer on screen, the scheme not yet applied to it. Starting at 0
  // would hand the reader the first mark before they had read the answer.
  const advance = useCallback(() => {
    setMobileStep((s) => Math.min((s ?? -1) + 1, STEP_COUNT - 1));
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!section || !stage) return;

    const mm = gsap.matchMedia();

    // Desktop/tablet, motion allowed: pin the stage and scrub the reveal.
    //
    // The min-height in the query is a coarse floor; the real gate is the
    // measurement inside. Pinning makes this stage the whole viewport for the
    // length of the scrub, so on a window too short to hold it the last
    // reveals — the conceptual error and the verdict, the two the act builds
    // to — would play below the fold with the page frozen and no way to scroll
    // to them. Measuring beats picking a breakpoint: the stage's height is a
    // function of this evaluation's text, the reader's font size and their
    // zoom level, and a number hardcoded against today's copy goes stale the
    // first time any of those change.
    mm.add(
      "(min-width: 768px) and (min-height: 600px) and (prefers-reduced-motion: no-preference)",
      () => {
        // Measured before anything is hidden, so this is the stage at its
        // full, finished height — exactly what the pin would have to hold.
        if (stage.getBoundingClientRect().height > window.innerHeight) {
          setMobileStep(-1);
          return () => setMobileStep(null);
        }

        const rows = gsap.utils.toArray<HTMLElement>("[data-step]", stage);
        const fills = gsap.utils.toArray<HTMLElement>("[data-highlight]", stage);
        const counter = counterRef.current;

        // Rewind the server-rendered end state to the start. Done here rather
        // than in CSS so it only ever happens for a visitor who will actually
        // see it animate forward again.
        gsap.set(rows, { opacity: 0, y: 16 });
        gsap.set(fills, { scaleX: 0, transformOrigin: "left center" });

        // A plain object rather than the DOM node, so the scrubbed value is
        // snapped to a whole mark before it is written out — a marking scheme
        // never awards 1.4.
        const tally = { marks: 0 };
        const writeTally = () => {
          if (counter) counter.textContent = String(Math.round(tally.marks));
        };
        writeTally();

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: section,
            pin: stage,
            // `true`, not a smoothing number. A numeric scrub interpolates the
            // timeline on GSAP's ticker, which means the section only advances
            // while requestAnimationFrame is firing; `true` binds progress
            // directly to scroll position. §4 specifies `scrub: true` and the
            // difference is not cosmetic.
            scrub: true,
            start: "top top",
            end: `+=${STEP_COUNT * 520}`,
            // Fraunces is large enough on this page that a late font swap moves
            // the start position by hundreds of pixels; a pinned trigger
            // measured against the fallback pins at the wrong scroll offset.
            invalidateOnRefresh: true,
          },
        });

        // Tracks the tally *as the finished timeline will read it*, so a step
        // that awards nothing — the missed point — adds no tween at all rather
        // than a no-op one from 2 to 2.
        let tallied = 0;

        rows.forEach((row, i) => {
          const at = i === 0 ? 0 : ">-0.1";
          tl.to(row, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, at);

          // Every word of this point's quote, in reading order.
          const run = fills.filter((f) => f.dataset.highlight === String(i));
          if (run.length) {
            // The row lands first, then the pen crosses the sentence it earned
            // its mark on — the point, then the evidence for it. The stagger is
            // divided by the word count so a long quote and a short one both
            // take the same half-second to cross, rather than the long one
            // taking four times as long.
            tl.to(
              run,
              {
                scaleX: 1,
                duration: 0.18,
                ease: "power1.inOut",
                stagger: run.length > 1 ? 0.34 / (run.length - 1) : 0,
              },
              ">-0.18"
            );
          }

          // The mark lands the instant the stroke finishes, not gradually over
          // it. A tweened tally rounds up at the halfway point, so the counter
          // read 1 while the pen was still two-thirds of the way across the
          // sentence that earned it — the number arriving before its reason.
          const marks = marksAtStep(i);
          if (marks !== tallied) {
            tallied = marks;
            tl.to(tally, { marks, duration: 0.01, onUpdate: writeTally }, run.length ? ">" : "<0.1");
          }
        });

        return () => {
          tl.scrollTrigger?.kill();
          tl.kill();
          // Put the DOM back exactly as the server sent it, so a viewport resize
          // across the 768px boundary hands the mobile branch a complete
          // section rather than the leftovers of a half-played timeline.
          gsap.set(rows, { clearProps: "all" });
          gsap.set(fills, { clearProps: "all" });
          if (counter) counter.textContent = String(EVAL.marks_awarded);
        };
      }
    );

    // Phones and very short windows: the stepper, driven by taps — no pin, no
    // scrub, no GSAP at all. A query list (the comma is an OR) so this is the
    // exact complement of the block above; the two can never both run, and can
    // never both sit out and leave the section with no driver. The block above
    // can also hand control here at run time, when the stage measures taller
    // than the viewport it would have to be pinned inside.
    //
    // Reduced motion at any size matches neither branch, deliberately: the
    // server already rendered the finished evaluation, which is the end state
    // a reduced-motion visitor is owed.
    mm.add(
      "(max-width: 767.98px) and (prefers-reduced-motion: no-preference), (max-height: 599.98px) and (prefers-reduced-motion: no-preference)",
      () => {
        setMobileStep(-1);
        return () => setMobileStep(null);
      }
    );

    // Fonts settle after the pin is measured; without this the stage pins at a
    // stale offset and unpins early.
    let refreshed = false;
    document.fonts?.ready
      .then(() => {
        if (!refreshed) {
          refreshed = true;
          ScrollTrigger.refresh();
        }
      })
      .catch(() => {});

    return () => mm.revert();
  }, []);

  const stepped = mobileStep !== null;
  const shown = (step: number) => !stepped || step <= mobileStep;
  const atEnd = stepped && mobileStep >= STEP_COUNT - 1;

  return (
    <section
      ref={sectionRef}
      id="evaluation"
      className="border-y border-border bg-card/30"
      aria-label="A real answer, marked"
    >
      {/* While pinned this stage is the whole viewport, so it has to fit in one
          — anything past the fold reveals where nobody can see it. It is
          centred in a viewport-height box on the sizes that pin, and reverts to
          ordinary flow padding everywhere else. The (min-height) half of the
          pin's media query is what keeps that promise; see the effect. */}
      <div
        ref={stageRef}
        className="mx-auto flex max-w-7xl flex-col justify-center px-6 py-16 md:min-h-dvh md:py-10 lg:px-12"
      >
        <div className="grid gap-8 lg:grid-cols-[minmax(0,180px)_minmax(0,1fr)] lg:gap-12">
          {/* Margin rail (§3): act number, label, running mark total. */}
          <div className="lg:border-r lg:border-rule lg:pr-8">
            <p className={sectionLabel}>Act 02 — The evaluation</p>
            <p
              className={`mt-6 font-mono text-4xl leading-none text-foreground ${numericFigures}`}
              aria-live="off"
            >
              {/* Mono, tabular — §2 calls this non-negotiable: proportional
                  figures read as decoration, mono reads as graded. */}
              {/* Two drivers, never at once: React owns this number while the
                  mobile stepper is walking, GSAP writes it directly during the
                  desktop scrub, and the server renders the true final mark for
                  everyone else. Leaving it at 2/3 through the mobile walk
                  would give away the answer the stepper is revealing. */}
              <span ref={counterRef}>
                {stepped ? marksAtStep(mobileStep) : EVAL.marks_awarded}
              </span>
              <span className="text-muted-foreground">/{EVAL.total_marks}</span>
            </p>
            <p className="mt-2 text-xs text-muted-foreground">marks awarded</p>
            <p className="mt-6 hidden text-xs leading-relaxed text-muted-foreground lg:block">
              {EVAL.board} {EVAL.subject} · {EVAL.year} · Q{EVAL.question_number}
            </p>
          </div>

          <div className="min-w-0">
            <h2 className="display-section max-w-[18ch] text-balance">
              Here is what the scheme actually wanted.
            </h2>

            {/* The answer, with each awarded quote highlighted as its point is
                reached. Same text node Act 1 rendered — the highlight lands on
                the sentences the visitor just watched being written. */}
            <div className="mt-6 rounded-lg border border-border bg-background p-4">
              <p className={sectionLabel}>The answer</p>
              {/* transform-gpu is load-bearing, not a perf hint. Every
                  HighlightedRun word carries its own transformed wash sibling
                  (even at rest, GSAP sets it to scaleX(0) on mount rather than
                  leaving it untouched), which promotes those words onto a
                  composited layer — and Chromium renders composited text with
                  grayscale antialiasing, not the subpixel/ClearType AA a plain
                  text node gets. The awarded and partial sentences are all
                  HighlightedRun words, so they were already on that layer; the
                  missed point's sentence is the one plain, un-wrapped span in
                  this paragraph, and on a real ClearType display it rendered
                  with a visibly different — faintly red/blue-fringed — edge
                  than its neighbours. Same ink color (both are --ink; this
                  never showed up in a getComputedStyle diff), different
                  antialiasing pipeline for the same paragraph.
                  transform-gpu promotes the whole paragraph to one layer, so
                  the plain segment renders through the identical grayscale
                  path as the wrapped ones — one paragraph, one AA mode,
                  regardless of which sentences happen to carry a mark. */}
              <p className="mt-2.5 max-w-[var(--measure)] font-display text-[16px] leading-[1.8] text-foreground transform-gpu">
                {SEGMENTS.map((seg, i) =>
                  seg.pointIndex === null ? (
                    <span key={i}>{seg.text}</span>
                  ) : (
                    <HighlightedRun
                      key={i}
                      text={seg.text}
                      pointIndex={seg.pointIndex}
                      status={POINTS[seg.pointIndex].status}
                      swept={stepped ? shown(seg.pointIndex) : null}
                    />
                  )
                )}
              </p>
            </div>

            {/* One row per scheme point, in scheme order — array position is
                the reveal order (§6), there is no separate order field. */}
            <ol className="mt-5 flex flex-col gap-2">
              {POINTS.map((p, i) => {
                const mark = STATUS_MARK[p.status] ?? STATUS_MARK.missed;
                return (
                  <li
                    key={`${p.point}-${i}`}
                    data-step={i}
                    hidden={!shown(i)}
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

            {/* The closing two beats sit side by side on wide screens rather
                than stacked. Stacked, the pinned stage ran 57px past a 900px
                viewport and the verdict — the thing the whole act builds to —
                played below the fold with the page frozen. They still reveal in
                sequence; only the layout is paired. */}
            <div className="mt-5 grid gap-5 lg:grid-cols-2 lg:items-start">
              {/* The conceptual error. §11 reserves its own treatment for this —
                  a filled callout with a heavy rule — so it is distinguished by
                  weight, not by hue competing with the point rows above. */}
              {EVAL.conceptual_errors.length > 0 ? (
                <div
                  data-step={ERROR_STEP}
                  hidden={!shown(ERROR_STEP)}
                  className="rounded-r-md border-l-2 border-accent bg-accent-subtle px-4 py-3.5"
                >
                  <p className={sectionLabel}>Where the third mark went</p>
                  {EVAL.conceptual_errors.map((err) => (
                    <p key={err} className="mt-2 text-[13px] leading-relaxed text-foreground">
                      {err}
                    </p>
                  ))}
                </div>
              ) : null}

              <div data-step={VERDICT_STEP} hidden={!shown(VERDICT_STEP)}>
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

            {/* The <768px fallback (§4): stepped and tap-advanced. Rendered
                only while the stepper is actually driving, so it never appears
                on a desktop scrub or for a reduced-motion visitor, who both
                already have the whole section. */}
            {stepped && !atEnd ? (
              <button
                type="button"
                onClick={advance}
                className="mt-6 inline-flex items-center justify-center rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-border"
              >
                {mobileStep < 0 ? "Mark this answer" : "Next point"} →
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
