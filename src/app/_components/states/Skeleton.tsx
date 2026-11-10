// Skeleton primitives. Server-safe (no hooks).
//
// Deliberately the quietest loading signal the system can give: hairline-grey
// blocks in the page's own rhythm, a slow opacity pulse, and nothing at all
// when the student has asked for reduced motion. No spinners, no shimmer
// gradients (the design system bans gradients), no centred "Loading…" text.
//
// Skeletons are sized to the real content so that when it arrives nothing
// moves: pages compose these in the same shell classes the real page uses.

import type { ReactNode } from "react";

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-md bg-rule/70 motion-reduce:animate-none ${className}`}
    />
  );
}

/** A few lines of body text, the last one shorter, as a paragraph would end. */
export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden className={`space-y-2.5 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-3.5 ${i === lines - 1 && lines > 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

/**
 * Wraps a skeleton as one polite live region with a single screen-reader
 * label, so assistive tech announces "Loading dashboard" once rather than
 * walking a dozen empty blocks.
 */
export function LoadingRegion({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
