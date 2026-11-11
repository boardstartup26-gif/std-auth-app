// Class strings shared by the dashboard's sections. Kept beside the page
// rather than in lib/ui.ts: they describe this page's card language (white
// sheet, hairline rule, small radius, faint lift) and nothing else uses them yet.

/** A white card on the paper ground. */
export const dashCard = "rounded-xl border border-border bg-card shadow-[0_1px_2px_rgb(22_24_29/0.04)]";

/** Section heading: Fraunces, semibold, tight. */
export const dashHeading = "font-display text-[1.375rem] font-semibold leading-tight tracking-[-0.01em] text-foreground";

/** The small uppercase rail label above a heading. */
export const dashEyebrow = "text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/80";

/** The compact filled red button used on cards. */
export const dashButton =
  "inline-flex items-center gap-1.5 rounded-md bg-accent px-3.5 py-2 text-[13px] font-medium text-background transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** A red text link with an arrow ("All subjects →"). */
export const dashLink =
  "inline-flex items-center gap-1 text-[13px] font-medium text-accent underline-offset-4 hover:text-accent-hover hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** The pale red square an outline icon sits in. */
export const iconChip = "grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-subtle text-accent";

/** Hover/focus treatment for a whole card that is one link. */
export const tileInteractive =
  "transition-[border-color,box-shadow] hover:border-accent/40 hover:shadow-[0_2px_8px_rgb(22_24_29/0.06)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
