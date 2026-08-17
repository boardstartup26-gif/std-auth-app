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