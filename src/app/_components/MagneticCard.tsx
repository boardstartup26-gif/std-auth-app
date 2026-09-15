"use client";

// A card that leans slightly toward the pointer and springs back when it
// leaves. "Slight" is the whole brief: the card moves a few pixels, the arrow
// a few more, and nothing rotates enough to make text sit off its baseline.
//
// Transform and opacity only, per §4 of the design handoff — those are the two
// properties the compositor can animate without laying the page out again, and
// a dashboard on a mid-range Android is exactly where that matters.
//
// The pull is computed from the pointer's offset within the card rather than
// from its distance to the centre in page space, so a card near the edge of
// the viewport behaves the same as one in the middle.

import { createElement, useCallback, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileSearch, History, type LucideIcon } from "lucide-react";

// Resolved here, by name, rather than taken as a prop. A Lucide icon is a
// function component, and a Server Component cannot pass one across the
// client boundary — React has no way to serialise it, and the page 500s with
// "Functions cannot be passed directly to Client Components". The dashboard is
// a Server Component, so the icon has to be chosen on this side of the line.
const CARD_ICONS = {
  practice: FileSearch,
  history: History,
} satisfies Record<string, LucideIcon>;

export type CardIcon = keyof typeof CARD_ICONS;

// Reduced 30% from the original 6/10 — the arrow keeps the same 10:6 ratio to
// the card so it still reads as leading the pull rather than lagging it.
const MAX_SHIFT_PX = 4.2;
const ARROW_SHIFT_PX = 7;

export function MagneticCard({
  href,
  title,
  description,
  icon,
  accentClass,
  washClass,
}: {
  href: string;
  title: string;
  description: string;
  icon: CardIcon;
  /** Title colour — each card gets its own so the pair is scannable. */
  accentClass: string;
  /** The oversized background glyph's tint. */
  washClass: string;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [pull, setPull] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLAnchorElement>) => {
    // A coarse pointer has no hover to track — a finger is either down or gone,
    // and following it would make the card jump under the tap.
    if (e.pointerType !== "mouse") return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // -1..1 from the card's own centre.
    const nx = (e.clientX - r.left) / r.width - 0.5;
    const ny = (e.clientY - r.top) / r.height - 0.5;
    setPull({ x: nx * 2 * MAX_SHIFT_PX, y: ny * 2 * MAX_SHIFT_PX });
    setActive(true);
  }, []);

  const release = useCallback(() => {
    setPull({ x: 0, y: 0 });
    setActive(false);
  }, []);

  return (
    <Link
      ref={ref}
      href={href}
      onPointerMove={onPointerMove}
      onPointerLeave={release}
      onBlur={release}
      className="group relative flex min-h-[188px] flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-6 transition-[border-color,box-shadow] hover:border-foreground/20 hover:shadow-[0_10px_30px_rgba(22,24,29,0.07)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transform-none"
      style={{
        // The card carries the transform inline because the value is continuous;
        // a utility class cannot express "6px toward wherever the cursor is".
        transform: `translate3d(${pull.x}px, ${pull.y}px, 0)`,
        transition: active
          ? "transform 90ms linear"
          : "transform var(--duration-base, 320ms) var(--ease-editorial, cubic-bezier(0.16,1,0.3,1))",
      }}
    >
      {/* Oversized glyph instead of an illustration: it scales to any card
          width, needs no asset, and inherits the theme's own colours. */}
      {createElement(CARD_ICONS[icon], {
        "aria-hidden": true,
        strokeWidth: 1.25,
        className: `pointer-events-none absolute -right-6 -top-6 h-40 w-40 ${washClass} transition-transform duration-500 group-hover:scale-105`,
      })}

      <div className="relative">
        <h3 className={`text-lg font-semibold tracking-tight ${accentClass}`}>{title}</h3>
        <p className="mt-2 max-w-[34ch] text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>

      <span
        aria-hidden
        className="relative mt-6 grid h-9 w-9 place-items-center rounded-full bg-foreground text-background"
        style={{
          transform: `translate3d(${(pull.x / MAX_SHIFT_PX) * ARROW_SHIFT_PX}px, ${
            (pull.y / MAX_SHIFT_PX) * ARROW_SHIFT_PX
          }px, 0)`,
          transition: active
            ? "transform 120ms linear"
            : "transform var(--duration-base, 320ms) var(--ease-editorial, cubic-bezier(0.16,1,0.3,1))",
        }}
      >
        <ArrowRight size={16} strokeWidth={2} />
      </span>
    </Link>
  );
}
