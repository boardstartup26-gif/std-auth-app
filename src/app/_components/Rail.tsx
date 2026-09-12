// src/app/_components/Rail.tsx
//
// The margin-rail grid (handoff §3) — the one device that unifies landing and
// app. Every page is the same asymmetric pair: a ~180px left rail carrying
// running context, a hairline, then the content column. What the rail holds
// changes per surface (dashboard: date, streak, tokens · results: running mark
// total, question index · history: timeline dates · landing: act number and
// section label); the geometry never does.
//
// This is deliberately NOT the nav sidebar. Sidebar.tsx is chrome — where you
// can go. The rail is annotation — what you are looking at. On desktop they
// stack left-to-right: icon nav, then page, whose first column is the rail.
//
// Usage:
//   <RailLayout>
//     <Rail>
//       <RailNote label="Today">12 Sep 2026</RailNote>
//       <RailNote label="Tokens"><span className={numericMono}>7 / 10</span></RailNote>
//     </Rail>
//     <RailContent>…</RailContent>
//   </RailLayout>

import { Hairline } from "./Hairline";

// The §2 metadata face: 12px, 0.08em tracking, uppercase, rail only. Exported
// because a surface will sometimes need the face without a RailNote wrapper —
// a scroll-progress readout, an act number. It is close to `sectionLabel` in
// lib/ui.ts but not the same thing: sectionLabel is the in-card eyebrow at
// 0.05em tracking, this is the rail face at the 0.08em the handoff specifies.
export const railLabel =
  "font-sans text-[length:var(--text-meta)] font-semibold uppercase tracking-[0.08em] text-muted-foreground";

// Values are not uppercased. The rail carries question numbers ("4(i)"),
// subject names and mark totals, and forcing caps on those either mangles them
// or quietly implies a formatting that isn't in the data.
export const railValue = "text-[length:var(--text-meta)] leading-snug text-foreground";

/**
 * Page-level grid. Owns the page shell too — §3 puts this grid on *every*
 * page, so a surface adopting the rail replaces its `pageShell` wrapper with
 * this rather than nesting one inside the other.
 *
 * `wide` matches the existing `pageShellWide` surfaces (history, admin), which
 * need the extra width for tabular content once the rail has taken its 180px.
 */
export function RailLayout({
  children,
  wide = false,
  className = "",
}: {
  children: React.ReactNode;
  wide?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`mx-auto min-h-screen px-6 py-12 ${wide ? "max-w-7xl" : "max-w-5xl"} ${
        // Single column below md. The rail's 180px is most of a phone's width,
        // and the content column is the part the student came for — so the rail
        // degrades to a horizontal strip above the content (see Rail) rather
        // than squeezing the measure to nothing.
        "flex flex-col md:grid md:grid-cols-[var(--rail-width)_1px_minmax(0,1fr)] md:items-start"
      } ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * The rail column. Sticks on desktop so the running context stays visible
 * through a long results page; on mobile it is a wrapping metadata strip with
 * the hairline beneath it instead of beside it.
 */
export function Rail({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <aside
      className={`
        mb-6 flex flex-row flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-border pb-3
        md:sticky md:top-12 md:mb-0 md:flex-col md:flex-nowrap md:items-stretch md:gap-y-5
        md:border-b-0 md:pb-0 md:pr-6
        ${className}
      `}
    >
      {children}
    </aside>
  );
}

/** One labelled entry in the rail. Label above value on desktop, inline on mobile. */
export function RailNote({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2 md:block">
      <p className={railLabel}>{label}</p>
      <div className={`${railValue} md:mt-1.5`}>{children}</div>
    </div>
  );
}

/**
 * The content column. The hairline between rail and content is rendered here
 * but is its own 1px grid column, not a border on either neighbour: a
 * `border-l` here would stop where the content stops and a `border-r` on the
 * rail would stop where the rail stops, whereas a grid item with `self-stretch`
 * spans the full row regardless of which column is taller. `md:contents` on the
 * wrapper below is what lifts the rule and the content out of this div and into
 * columns 2 and 3 of RailLayout's grid; on mobile the wrapper stays a real flex
 * box and the rule is hidden.
 *
 * `measure` caps the column at the §2 68ch measure. It is opt-in, not the
 * default: 68ch is the cap for *prose*, and a card grid or a table inside the
 * content column is not prose and should use the full width.
 */
export function RailContent({
  children,
  measure = false,
  className = "",
}: {
  children: React.ReactNode;
  measure?: boolean;
  className?: string;
}) {
  return (
    <div className="flex min-w-0 md:contents">
      <Hairline orientation="vertical" className="hidden md:block" />
      <div
        className={`min-w-0 flex-1 md:pl-6 ${measure ? "max-w-[var(--measure)]" : ""} ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
