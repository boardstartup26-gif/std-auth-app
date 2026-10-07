"use client";

// The score, arriving: the ring fills and the figure counts up together, once,
// decelerating into place. The final value is what renders first (server, no
// JS, reduced motion, background tab), and the animation only runs when the
// browser can actually show it.

import { useEffect, useRef, useState } from "react";
import { numericFigures } from "@/lib/ui";

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

const R = 54;
const C = 2 * Math.PI * R;

export function ScoreReveal({ score, outOf, percent }: { score: number; outOf: number; percent: number }) {
  const [t, setT] = useState(1);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.hidden) return;
    const duration = 1400;
    let start: number | null = null;
    let raf = 0;
    const tick = (now: number) => {
      start ??= now;
      const p = Math.min(1, (now - start) / duration);
      setT(1 - Math.pow(1 - p, 3)); // ease-out cubic
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame((now) => {
      setT(0);
      tick(now);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const shown = t >= 1 ? score : Math.round(score * t * 2) / 2;
  const fill = (percent / 100) * t;

  return (
    <div className="flex items-center gap-6 sm:gap-8">
      <div className="relative h-36 w-36 shrink-0 sm:h-40 sm:w-40">
        <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="64" cy="64" r={R} fill="none" strokeWidth="8" className="stroke-rule" />
          <circle
            cx="64"
            cy="64"
            r={R}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            className="stroke-foreground"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - fill)}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center" aria-hidden>
          <span className={`${numericFigures} font-display text-3xl text-foreground sm:text-4xl`}>
            {Math.round(percent * t)}%
          </span>
        </div>
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Your score</p>
        <p aria-hidden className={`${numericFigures} mt-1 font-display text-6xl leading-none text-foreground sm:text-7xl`}>
          {fmt(shown)}
          <span className="text-3xl text-muted-foreground sm:text-4xl">/{fmt(outOf)}</span>
        </p>
        <span className="sr-only">
          {fmt(score)} out of {fmt(outOf)}, {percent} percent
        </span>
      </div>
    </div>
  );
}
