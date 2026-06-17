// src/lib/ui.ts

// ─── Layout Shells ──────────────────────────────────────────────────────────
export const pageShell = "max-w-5xl mx-auto px-6 py-12 min-h-screen bg-background text-foreground transition-colors duration-200";

export const pageShellWide = "max-w-7xl mx-auto px-6 py-12 min-h-screen bg-background text-foreground transition-colors duration-200";

// This is the token AuthForm.tsx was missing! Centered container for clean login screens.
export const authShell = "w-full max-w-md mx-auto min-h-screen flex flex-col justify-center px-4 py-12 bg-background text-foreground transition-colors duration-200";

// ─── Cards and Panels ───────────────────────────────────────────────────────
export const cardPadded = "p-8 rounded-2xl bg-card border border-border shadow-sm transition-all";

export const cardInteractive = "block p-6 rounded-2xl bg-card border border-border shadow-sm transition-all hover:opacity-90";

export const mutedPanel = "p-5 rounded-xl bg-zinc-100/50 border border-zinc-200/50 dark:bg-zinc-900/40 dark:border-zinc-800/60";

// ─── Typography & Actions ───────────────────────────────────────────────────
export const sectionLabel = "text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500";

export const backLink = "inline-flex items-center text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors dark:text-zinc-400 dark:hover:text-zinc-200";

// ─── Interactive Form Fields ────────────────────────────────────────────────
export const inputBase = "block rounded-xl border border-border bg-card px-3 text-sm text-foreground shadow-sm outline-none transition-all focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400";

// ─── Interactive Buttons ────────────────────────────────────────────────────
export const btnPrimary = "inline-flex items-center justify-center rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background shadow-sm transition-colors hover:opacity-90 disabled:opacity-50";

export const btnSecondary = "inline-flex items-center justify-center rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800";

// ─── Alerts & Badges ────────────────────────────────────────────────────────
export const errorAlert = "p-4 rounded-xl border border-red-100 bg-red-50/50 text-sm font-medium text-red-800 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400";

export function scoreBadgeClass(awarded: number, total: number) {
  const ratio = total > 0 ? awarded / total : 0;
  if (ratio >= 0.8) return "inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20";
  if (ratio >= 0.4) return "inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/10 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20";
  return "inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/20";
}