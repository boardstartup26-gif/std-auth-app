// The Generic-AI / BoardEdge comparison: a heading and an image behind each
// column, so the two sides are told apart before a word of the lists is read.
// The cards come in from opposite edges and meet in the middle.
//
// The artwork carries the branding now, so the small logo chips that used to
// sit above the heading are gone — the marks appeared twice otherwise.
//
// On the trademarks in the Generic-AI artwork: they are other companies'
// marks, used to name what BoardEdge is being compared against. That is what a
// comparison is for, and the claims beside them are about capability, not
// quality — a general chatbot genuinely has no access to a CISCE marking
// scheme. The footer disclaims affiliation.

import Image from "next/image";
import { Check, X as XIcon } from "lucide-react";
import { sectionLabel } from "@/lib/ui";
import { SweepIn } from "@/app/_components/SweepIn";

const GENERIC_AI_POINTS = [
  "Gives a rough estimate, not a real score",
  "No access to official ICSE marking schemes",
  "Generic feedback — not calibrated to your exam board",
  "Can't tell you which specific marking-scheme point you missed",
];

const BOARDEDGE_POINTS = [
  "Awards marks against the exact CISCE marking scheme",
  "Shows every point hit and point missed — mapped to official criteria",
  "Trained on ICSE-specific evaluation standards",
  "Structured feedback: marks, points hit, points missed, conceptual errors, model answer",
];

// Opacities picked by measurement, not by eye: each artwork was composited over
// its own card colour and the worst-case contrast against the text that sits on
// top was computed across every pixel. 16% is the most the Generic-AI artwork
// can take and still clear 4.5:1 for muted body text (4.94:1); the BoardEdge
// artwork sits under near-black ink and has far more headroom (11.8:1 at 16%),
// so 18% there is a visual balance decision rather than a contrast limit.
const GENERIC_AI_OPACITY = 0.16;
const BOARDEDGE_OPACITY = 0.18;

function CardArt({ src, opacity }: { src: string; opacity: number }) {
  return (
    <Image
      src={src}
      alt=""
      aria-hidden
      fill
      sizes="(min-width: 640px) 50vw, 100vw"
      // object-contain rather than cover: these are single motifs, and cover
      // crops the Generic-AI cluster until only two of its logos survive.
      className="pointer-events-none select-none object-contain object-bottom"
      style={{ opacity }}
    />
  );
}

export function Comparison() {
  return (
    // The cards start 48px outside their own boxes. Clipping here rather than
    // letting the page scroll sideways for the half-second they are in flight.
    <div className="mt-20 grid gap-6 overflow-x-clip sm:grid-cols-2">
      <SweepIn
        from="left"
        className="relative isolate overflow-hidden rounded-2xl border border-border bg-card/60 p-8"
      >
        <CardArt src="/gen-ai_dis.png" opacity={GENERIC_AI_OPACITY} />

        <div className="relative">
          <p className={sectionLabel}>Generic AI</p>
          <h3 className="mt-2 font-display text-2xl leading-snug text-foreground">
            Marks it the way it thinks it should be marked.
          </h3>

          <ul className="mt-6 space-y-4">
            {GENERIC_AI_POINTS.map((point) => (
              <li
                key={point}
                className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground"
              >
                <XIcon size={17} className="mt-0.5 shrink-0" aria-hidden />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </SweepIn>

      <SweepIn
        from="right"
        className="relative isolate overflow-hidden rounded-2xl border border-accent/40 bg-accent-subtle p-8"
      >
        <CardArt src="/be_dis.png" opacity={BOARDEDGE_OPACITY} />

        <div className="relative">
          <p className="text-xs font-bold uppercase tracking-wider text-accent">BoardEdge</p>
          <h3 className="mt-2 font-display text-2xl leading-snug text-foreground">
            Marks it the way the scheme says to mark it.
          </h3>

          <ul className="mt-6 space-y-4">
            {BOARDEDGE_POINTS.map((point) => (
              <li
                key={point}
                className="flex items-start gap-3 text-sm leading-relaxed text-foreground/90"
              >
                <Check size={17} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </SweepIn>
    </div>
  );
}
