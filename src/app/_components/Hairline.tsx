// src/app/_components/Hairline.tsx
//
// The only depth device in the system. Per §1 of the handoff there are no
// gradients, no glow, no glassmorphism and no coloured shadows — separation
// comes from a 1px --rule line and from paper elevation (--surface over --bg).
// Everything that would previously have been a shadow or a tint is this.
//
// It is a component rather than a `border-t border-border` on the neighbouring
// element because the rule is a thing in the layout, not a property of whatever
// happens to sit above it: in the margin-rail grid (§3) the same line separates
// rail from content on every page, and a border belonging to one side of that
// pair stops at that side's height.

export function Hairline({
  orientation = "horizontal",
  className = "",
}: {
  orientation?: "horizontal" | "vertical";
  className?: string;
}) {
  // `bg-border` on a 1px box, not a border: a border on a zero-height element
  // is subject to collapsing and to the element's own box-sizing, and renders
  // inconsistently at fractional device pixel ratios. A painted box does not.
  const shape =
    orientation === "vertical" ? "w-px self-stretch" : "h-px w-full";

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={`shrink-0 bg-border ${shape} ${className}`}
    />
  );
}
