// src/app/admin/_components/Panels.tsx
//
// Presentational pieces for the admin dashboard. All server components — no
// interactivity, no client bundle, and no path by which aggregated metrics
// could reach a browser that hasn't already passed the admin guard.
//
// Colour note: per §5 of boardedge-design-system-v2.md ("The Gold Rule"),
// --accent is reserved for primary CTAs and active nav state, so no bar or
// figure on this page is gold. Bars are monochrome; the semantic status
// colours appear only where they mean what they mean elsewhere in the app —
// red for failure, green for a good outcome, yellow for a partial one.

import { cardPadded, numericMono, sectionLabel } from "@/lib/ui";

export type Tone = "neutral" | "good" | "bad" | "warn";

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-foreground",
  good: "text-status-correct",
  bad: "text-status-wrong",
  warn: "text-status-partial",
};

const TONE_BAR: Record<Tone, string> = {
  neutral: "bg-foreground/70",
  good: "bg-status-correct",
  bad: "bg-status-wrong",
  warn: "bg-status-partial",
};

// ─── Formatters ──────────────────────────────────────────────────────────────

export function formatNumber(value: number): string {
  return value.toLocaleString("en-IN");
}

/** Null renders as an em dash — "no data yet" must never look like 0%. */
export function formatPercent(value: number | null, digits = 0): string {
  if (value === null || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// ─── Building blocks ─────────────────────────────────────────────────────────

export function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <p className={sectionLabel}>{label}</p>
      <p className={`mt-2 text-2xl font-bold sm:text-3xl ${numericMono} ${TONE_TEXT[tone]}`}>
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`${cardPadded} p-5 sm:p-6`}>
      <header className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
      </header>
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
      {children}
    </p>
  );
}

/**
 * One labelled bar. `share` drives the width; `value` and `meta` are the
 * numbers beside it. On narrow screens the label and value sit on one line
 * above the bar rather than competing for the same row.
 */
export function BarRow({
  label,
  value,
  share,
  meta,
  tone = "neutral",
}: {
  label: string;
  value: string;
  share: number;
  meta?: string;
  tone?: Tone;
}) {
  const width = Math.max(0, Math.min(1, share)) * 100;
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm text-foreground">{label}</span>
        <span className={`shrink-0 text-sm font-semibold ${numericMono} ${TONE_TEXT[tone]}`}>
          {value}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-3">
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-border"
          role="img"
          aria-label={`${label}: ${value}`}
        >
          {/* Zero-width bars are still rendered so the row keeps its rhythm. */}
          <div className={`h-full rounded-full ${TONE_BAR[tone]}`} style={{ width: `${width}%` }} />
        </div>
        {meta ? (
          <span className={`shrink-0 text-[11px] text-muted-foreground ${numericMono}`}>{meta}</span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A funnel step. Shows the drop from the step above, which is the number that
 * actually tells you where students are being lost — the absolute count on its
 * own never does.
 */
export function FunnelRow({
  label,
  count,
  share,
  fromPrevious,
  hint,
}: {
  label: string;
  count: number;
  share: number;
  fromPrevious: number | null;
  hint?: string;
}) {
  // Only flag a drop once there is enough traffic for the ratio to mean
  // anything; 1 of 2 visitors leaving is not a red flag, it is two visitors.
  const tone: Tone =
    fromPrevious === null || count < 5 ? "neutral" : fromPrevious < 0.25 ? "bad" : fromPrevious < 0.6 ? "warn" : "good";

  return (
    <div className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-sm text-foreground">{label}</span>
        <span className="flex shrink-0 items-baseline gap-2">
          <span className={`text-sm font-semibold ${numericMono} text-foreground`}>
            {formatNumber(count)}
          </span>
          {fromPrevious !== null ? (
            <span className={`text-[11px] ${numericMono} ${TONE_TEXT[tone]}`}>
              {formatPercent(fromPrevious)}
            </span>
          ) : null}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-foreground/70"
          style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }}
        />
      </div>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
