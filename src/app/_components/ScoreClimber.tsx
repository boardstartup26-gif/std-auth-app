"use client";

// Act 4 — Trajectory. The line draws itself on entry via stroke-dashoffset
// (§4's "tick draw" mechanic, applied to a chart rather than a checkmark).
//
// The data is a labelled example, not a statistic. There is no cohort of
// students to average yet, and a marketing page that draws an invented
// improvement curve and lets it read as measured outcome is lying with a
// chart. It is framed in the copy as one question re-attempted, which is a
// true description of what the product does and makes no claim about results.

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/** Marks out of 5 across successive attempts at one question. */
const ATTEMPTS = [2, 3, 3, 4, 5];
const TOTAL = 5;

const W = 520;
const H = 190;
const PAD_X = 34;
const PAD_Y = 22;

function pointFor(index: number, value: number) {
  const x = PAD_X + (index / (ATTEMPTS.length - 1)) * (W - PAD_X * 2);
  const y = H - PAD_Y - (value / TOTAL) * (H - PAD_Y * 2);
  return { x, y };
}

export function ScoreClimber() {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;

    const line = svg.querySelector<SVGPathElement>("[data-climb-line]");
    const dots = svg.querySelectorAll<SVGCircleElement>("[data-climb-dot]");
    if (!line) return;

    const length = line.getTotalLength();
    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set(line, { strokeDasharray: "none", strokeDashoffset: 0, opacity: 1 });
      gsap.set(dots, { opacity: 1, scale: 1 });
    });

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const tl = gsap.timeline({
        scrollTrigger: { trigger: svg, start: "top 80%", once: true },
      });

      gsap.set(line, { strokeDasharray: length, strokeDashoffset: length, opacity: 1 });
      gsap.set(dots, { opacity: 0, scale: 0.6, transformOrigin: "center" });

      tl.to(line, { strokeDashoffset: 0, duration: 1.1, ease: "power2.inOut" })
        // Dots land just behind the line as it passes each one, so the mark
        // appears to be plotted by the stroke rather than after it.
        .to(dots, { opacity: 1, scale: 1, duration: 0.24, stagger: 0.16 }, 0.18);

      return () => {
        tl.scrollTrigger?.kill();
        tl.kill();
      };
    });

    return () => mm.revert();
  }, []);

  const points = ATTEMPTS.map((v, i) => pointFor(i, v));
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");

  return (
    <figure className="m-0">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full max-w-[520px]"
        role="img"
        aria-label={`Example trajectory: marks on one question across five attempts — ${ATTEMPTS.join(", ")} out of ${TOTAL}.`}
      >
        {/* Baseline and ceiling, as hairlines rather than a full grid — the
            shape of the climb is the content, not the gridlines. */}
        {[0, TOTAL].map((v) => {
          const { y } = pointFor(0, v);
          return (
            <line
              key={v}
              x1={PAD_X}
              x2={W - PAD_X}
              y1={y}
              y2={y}
              stroke="var(--rule)"
              strokeWidth={1}
            />
          );
        })}

        {[0, TOTAL].map((v) => {
          const { y } = pointFor(0, v);
          return (
            <text
              key={v}
              x={PAD_X - 10}
              y={y + 4}
              textAnchor="end"
              fill="var(--ink-muted)"
              className="text-[11px]"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {v}
            </text>
          );
        })}

        <path
          data-climb-line
          d={d}
          fill="none"
          stroke="var(--awarded)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0}
        />

        {points.map((p, i) => (
          <circle
            key={i}
            data-climb-dot
            cx={p.x}
            cy={p.y}
            r={4}
            fill="var(--bg)"
            stroke="var(--awarded)"
            strokeWidth={2}
            opacity={0}
          />
        ))}

        {points.map((p, i) => (
          <text
            key={`label-${i}`}
            x={p.x}
            y={H - 4}
            textAnchor="middle"
            fill="var(--ink-muted)"
            className="text-[10px]"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {i + 1}
          </text>
        ))}
      </svg>
      <figcaption className="mt-3 text-xs text-muted-foreground">
        Example — marks on one question across five attempts. Illustrative of what the
        history page tracks, not an average across students.
      </figcaption>
    </figure>
  );
}
