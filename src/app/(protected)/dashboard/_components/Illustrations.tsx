// Pen-sketch illustrations for the dashboard header and the two primary cards,
// drawn in the accent ink at low strength so they sit behind the type rather
// than compete with it. Decorative only: aria-hidden, no text, and hidden on
// narrow screens where they would crowd the copy. Strokes use currentColor so
// the caller sets the ink with a text-* class and the theme tokens still apply.

const ink = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
const wash = "color-mix(in srgb, currentColor 9%, transparent)";

/** A classical portico among trees: the examination hall. */
export function HallSketch({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 150" className={className} aria-hidden focusable="false">
      {/* trees */}
      <g {...ink} strokeWidth={1.1} opacity={0.75}>
        <path d="M22 132c-6-10-4-22 4-30-4-10 4-20 13-18 6-9 20-6 22 4 9 2 12 13 6 20 5 9-1 21-11 22" />
        <path d="M30 108c4 3 9 3 13 0M38 96c3 4 8 5 12 3M45 132v-24" />
        <path d="M196 132c-4-9 0-19 7-23-2-10 8-17 16-12 8-4 17 3 15 12 6 6 4 17-4 21" />
        <path d="M212 132v-22M206 116c3 3 8 3 11 0" />
      </g>
      {/* steps */}
      <path {...ink} d="M54 134h132M58 129h124M62 124h116" />
      {/* columns */}
      <g {...ink}>
        {[72, 92, 112, 132, 152, 168].map((x) => (
          <g key={x}>
            <path d={`M${x} 124V78M${x + 7} 124V78`} />
            <path d={`M${x - 2} 78h11M${x - 2} 124h11`} strokeWidth={1} />
            <path d={`M${x + 3.5} 82v38`} strokeWidth={0.6} opacity={0.6} />
          </g>
        ))}
      </g>
      {/* entablature + pediment */}
      <path d="M64 70h112v8H64z" {...ink} fill={wash} />
      <path d="M60 70l60-30 60 30z" {...ink} fill={wash} />
      <path {...ink} strokeWidth={0.8} d="M76 66l44-21 44 21M60 74h120" />
      <circle cx="120" cy="58" r="4" {...ink} strokeWidth={0.9} />
      {/* ground hatching */}
      <path {...ink} strokeWidth={0.7} opacity={0.5} d="M40 140h40M96 141h52M160 140h44" />
    </svg>
  );
}

/** A stack of three textbooks. */
export function BookStackSketch({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 96" className={className} aria-hidden focusable="false">
      <g {...ink}>
        <path d="M14 78l62 8 32-12-62-7z" fill={wash} />
        <path d="M14 78v8l62 8v-8M76 94l32-12v-8" />
        <path d="M18 84l56 7M20 81l54 7" strokeWidth={0.6} opacity={0.6} />

        <path d="M20 58l58 7 26-11-58-6z" fill={wash} />
        <path d="M20 58v10l58 7v-10M78 75l26-11v-10" />
        <path d="M24 64l52 6M24 61l52 6" strokeWidth={0.6} opacity={0.6} />

        <path d="M26 40l52 8 22-10-52-7z" fill={wash} />
        <path d="M26 40v9l52 8v-9M78 57l22-10v-9" />
        <path d="M30 45l46 7" strokeWidth={0.6} opacity={0.6} />
        <path d="M58 34l-4 12 6-3 4 5 2-13" strokeWidth={1} />
      </g>
    </svg>
  );
}

/** An open book with a few ruled lines. */
export function OpenBookSketch({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 96" className={className} aria-hidden focusable="false">
      <g {...ink}>
        <path d="M60 30c-14-8-32-9-48-4v52c16-5 34-4 48 4z" fill={wash} />
        <path d="M60 30c14-8 32-9 48-4v52c-16-5-34-4-48 4z" fill={wash} />
        <path d="M60 30v52M10 80c18-4 36-3 50 6 14-9 32-10 50-6" />
        <g strokeWidth={0.7} opacity={0.65}>
          <path d="M20 38c10-2 22-1 32 3M20 46c10-2 22-1 32 3M20 54c10-2 22-1 32 3M20 62c10-2 22-1 32 3" />
          <path d="M68 41c10-4 22-5 32-3M68 49c10-4 22-5 32-3M68 57c10-4 22-5 32-3M68 65c10-4 22-5 32-3" />
        </g>
      </g>
    </svg>
  );
}

/** A magnifying glass over a marked sheet (Leakage Map). */
export function MagnifierSketch({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 96" className={className} aria-hidden focusable="false">
      <g {...ink}>
        <path d="M14 18l50-8 10 66-50 8z" {...ink} fill={wash} />
        <g strokeWidth={0.7} opacity={0.65}>
          <path d="M22 28l34-5M23 36l34-5M24 44l22-3M25 52l30-4M26 60l18-3" />
        </g>
        <circle cx="70" cy="46" r="20" {...ink} fill="var(--bg, #fff)" />
        <circle cx="70" cy="46" r="15" strokeWidth={0.8} opacity={0.6} />
        <path d="M62 40c2-4 6-6 10-6" strokeWidth={1} opacity={0.7} />
        <path d="M84 60l20 20" strokeWidth={4} />
        <path d="M84 60l20 20" stroke="var(--bg, #fff)" strokeWidth={1.4} />
      </g>
    </svg>
  );
}

/** Rising bars with an arrow (Reattempt Gain). */
export function RisingChartSketch({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 96" className={className} aria-hidden focusable="false">
      <g {...ink}>
        <path d="M10 86h100" />
        {[
          [22, 70],
          [44, 58],
          [66, 44],
          [88, 28],
        ].map(([x, y]) => (
          <path key={x} d={`M${x} 86V${y}h14v${86 - y}`} {...ink} fill={wash} />
        ))}
        <path d="M14 62c20-6 38-16 56-30 10-8 20-16 30-24" strokeWidth={1.6} />
        <path d="M90 8h12v12" strokeWidth={1.6} />
      </g>
    </svg>
  );
}
