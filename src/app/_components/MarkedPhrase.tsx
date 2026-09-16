"use client";

// A phrase in the masthead with a teacher's-red stroke drawn under it, the way
// a marker underlines the thing that matters on a script.
//
// Three beats, all transform/opacity per handoff §4: the stroke draws left to
// right (§4's tick-draw mechanic, on a pen line rather than a checkmark), a
// small nib rides its leading edge and lifts off when it lands, then the whole
// mark drifts by a pixel and a half on a slow loop — a hand resting on the
// page, not an animation asking to be watched.
//
// It waits for the headline. The masthead reveals on load and this would
// otherwise underline a phrase that had not appeared yet.
//
// The line renders drawn, in full, from the server. JS re-hides it with a
// dash offset only when it is going to draw it again — so a script failure
// leaves the phrase underlined rather than bare.
//
// The phrase must be short enough never to wrap: the mark is positioned under
// one inline-block box, so a phrase broken across two lines would be underlined
// across only the first. "inside out" at the display size is two short words —
// anything longer belongs in the sentence, not under the pen.

import { useEffect, useRef } from "react";
import gsap from "gsap";

// A hand-drawn line rather than a rule: it rises a little to the right and
// thins at the ends, which is what a stroke made in one movement does. Drawn
// in a 200x12 box and stretched non-uniformly (preserveAspectRatio="none") to
// whatever width the phrase renders at.
//
// The stroke deliberately does NOT carry vector-effect="non-scaling-stroke".
// That was tried first, to keep the line's weight constant at any width, but
// non-scaling-stroke combined with stroke-dasharray/stroke-dashoffset under a
// non-uniform scale is a real Chromium rendering bug: the dash pattern gets
// computed in a coordinate space that disagrees with where the stroke is
// painted, and the line visibly stops partway across — exactly like a broken
// underline — even though stroke-dashoffset reports fully drawn. Dropping the
// vector-effect fixes it, and costs nothing: the stroke now scales with the
// box like any other SVG geometry, which for a hand-drawn mark is the more
// correct behaviour anyway — thicker under the 115px desktop headline,
// thinner under the 56px mobile one, in proportion to the text it marks.
const STROKE = "M2,9 C34,4.2 78,3.1 120,4.4 C152,5.4 180,6.8 198,5";

export function MarkedPhrase({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    const line = el.querySelector<SVGPathElement>("[data-mark-line]");
    const nib = el.querySelector<SVGCircleElement>("[data-mark-nib]");
    const mark = el.querySelector<SVGSVGElement>("[data-mark]");
    if (!line || !mark) return;

    const mm = gsap.matchMedia();

    // Reduced motion: the mark is simply there. It is meaning, not decoration —
    // removing it would take the emphasis away, not just the movement.
    mm.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set(line, { strokeDasharray: "none", strokeDashoffset: 0 });
      if (nib) gsap.set(nib, { opacity: 0 });
    });

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const length = line.getTotalLength();
      gsap.set(line, { strokeDasharray: length, strokeDashoffset: length });
      if (nib) gsap.set(nib, { opacity: 0 });

      const tl = gsap.timeline({ delay: 0.75 });

      tl.to(line, { strokeDashoffset: 0, duration: 0.55, ease: "power2.inOut" });
      if (nib) {
        // The nib tracks the leading edge. The stroke is near-horizontal, so
        // matching it on x alone is indistinguishable from riding the path
        // itself — and it costs no extra plugin.
        tl.fromTo(
          nib,
          { opacity: 1, x: 0 },
          { x: 196, duration: 0.55, ease: "power2.inOut" },
          "<"
        ).to(nib, { opacity: 0, duration: 0.2 }, ">-0.12");
      }

      // The resting hand. A pixel and a half, back and forth over five seconds,
      // is below the threshold where the eye reads it as motion; it reads as the
      // page being alive.
      tl.to(mark, {
        x: 1.5,
        duration: 2.5,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      });

      // A page opened in a background tab never fires requestAnimationFrame,
      // so this timeline sits at t=0 — and because JS has already hidden the
      // stroke behind a dash offset, the phrase would come back to a visible
      // tab with no mark at all. The same guard the masthead reveal carries,
      // for the same reason. setTimeout keeps running when rAF does not.
      const failsafe = window.setTimeout(() => {
        if (tl.progress() === 0) {
          gsap.set(line, { strokeDasharray: "none", strokeDashoffset: 0 });
        }
      }, 3000);

      return () => {
        window.clearTimeout(failsafe);
        tl.kill();
      };
    });

    return () => mm.revert();
  }, []);

  return (
    <span ref={root} className="relative inline-block whitespace-nowrap">
      {children}
      {/* Positioned in ems off the phrase's own top rather than with
          `top-full`. The display line-height is 0.92 — tighter than the font's
          em box — so the element's bottom edge sits *below* the baseline, and
          anchoring there put the mark a quarter of an em down, far enough to
          clash with the next line when the headline wraps. 0.86em lands the
          stroke about a tenth of an em under the baseline, where a pen would. */}
      <svg
        data-mark
        aria-hidden
        viewBox="0 0 200 12"
        preserveAspectRatio="none"
        className="pointer-events-none absolute left-0 top-[0.86em] h-[0.16em] w-full overflow-visible"
      >
        <path
          data-mark-line
          d={STROKE}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={5}
          strokeLinecap="round"
        />
        <circle
          data-mark-nib
          cx={2}
          cy={9}
          r={3}
          fill="var(--accent)"
          opacity={0}
        />
      </svg>
    </span>
  );
}
