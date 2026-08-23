// src/lib/ui.ts

export const pageShell = "max-w-5xl mx-auto px-6 py-12 min-h-screen bg-background text-foreground transition-colors duration-200";
export const pageShellWide = "max-w-7xl mx-auto px-6 py-12 min-h-screen bg-background text-foreground transition-colors duration-200";
export const authShell = "w-full max-w-md mx-auto min-h-screen flex flex-col justify-center px-4 py-12 bg-background text-foreground transition-colors duration-200";

export const cardPadded = "p-8 rounded-2xl bg-card border border-border shadow-sm transition-all";
export const cardInteractive = "block p-6 rounded-2xl bg-card border border-border shadow-sm transition-all hover:opacity-90";
export const mutedPanel = "p-5 rounded-xl bg-card/60 border border-border";

export const sectionLabel = "text-xs font-bold uppercase tracking-wider text-muted-foreground";
export const backLink = "inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors";

export const inputBase = "block rounded-xl border border-border bg-card px-3 text-sm text-foreground shadow-sm outline-none transition-all focus:border-accent focus:ring-1 focus:ring-accent";

export const btnPrimary = "inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-background shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50";
export const btnSecondary = "inline-flex items-center justify-center rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-border";

export const errorAlert = "p-4 rounded-xl border border-red-900/40 bg-red-950/30 text-sm font-medium text-red-300";

// Dedicated mono token — Geist Mono, for question IDs, marks, token counters
export const numericMono = "font-mono tabular-nums";

// ─── Question sheet (/evaluate) ─────────────────────────────────────────────
// The question and its figure sit on a light "paper" surface rather than the
// dark card. Figures are scans of printed papers — black line art on white —
// and a white image dropped onto a dark panel reads as a hole punched in the
// page. Giving the whole question block a paper ground makes the figure part
// of the sheet instead of a foreign object on it.

export const sheet =
  "overflow-hidden rounded-xl bg-paper text-paper-ink shadow-[0_1px_0_#ffffff20,0_6px_20px_#00000055]";
export const sheetTop =
  "flex flex-wrap items-center gap-2 border-b border-paper-rule bg-paper-head px-4 py-2.5";
export const sheetBody = "flex flex-col gap-3 px-4 py-4";
export const sheetFoot =
  "flex flex-wrap items-center gap-2.5 border-t border-paper-rule bg-paper-foot px-4 py-2 font-mono text-[10px] text-paper-ink-soft";

// The question itself is the one thing on the page a student must not skim,
// so it gets weight the surrounding chrome doesn't.
export const sheetQuestionText =
  "m-0 text-[15px] font-bold leading-relaxed tracking-[-0.005em] text-paper-ink";

export const figPlate =
  "relative grid min-h-[128px] place-items-center rounded-md border border-paper-rule bg-white p-3.5";
export const figTool =
  "rounded border border-[#BDBBAD] bg-white/95 px-2 py-1 font-mono text-[10px] font-semibold text-[#2F2E28] transition-colors hover:border-cursor hover:text-[#14384F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cursor";
export const figCaption =
  "flex flex-wrap items-baseline gap-2 font-mono text-[9.5px] tracking-wide text-paper-ink-soft";

// Selector strip — four stacked dropdowns in a tall card cost more vertical
// space than the figure they push off screen.
export const selectorStrip =
  "flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-2.5";
export const selectorLabel =
  "font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground";

// Remaining-token count carries its own status colour. Only this number is
// coloured — the per-question cost beside it stays neutral, so the colour
// always means "how much you have left", never "what this costs".
export function tokenCountClass(remaining: number): string {
  const base = "font-mono font-bold tabular-nums";
  if (remaining >= 13) return `${base} text-status-correct`;
  if (remaining >= 7) return `${base} text-status-partial`;
  return `${base} text-status-wrong`;
}

export function scoreBadgeClass(awarded: number, total: number, size: "sm" | "lg" | "xl" = "sm") {
  const sizeClass =
    size === "xl"
      ? "px-8 py-3 text-4xl font-bold"
      : size === "lg"
      ? "px-3 py-1 text-sm font-semibold"
      : "px-2.5 py-0.5 text-xs font-semibold";
  const base = `inline-flex items-center rounded-full border font-mono tabular-nums ${sizeClass}`;

  if (!total) {
    return `${base} border-border bg-card text-muted-foreground`;
  }
  if (awarded === total) return `${base} border-status-correct bg-status-correct-subtle text-status-correct`;
  if (awarded === 0) return `${base} border-status-wrong bg-status-wrong-subtle text-status-wrong`;
  return `${base} border-status-partial bg-status-partial-subtle text-status-partial`;
}