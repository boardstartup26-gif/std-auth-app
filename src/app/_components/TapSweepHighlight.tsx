"use client";

// The Results page's tap-to-highlight — the same pen-drawn sweep mechanic as
// the landing page's Act 2, triggered by a tap instead of a scroll position
// (handoff §11: "same highlight mechanic as Act2's tick-draw, on tap instead
// of on scroll"). A second, independent implementation rather than a shared
// import from Act2Evaluation.tsx: that component's sweep is one piece of a
// single master GSAP timeline shared with the row reveals and the running
// tally, and bending this page's tap state through that timeline's shape
// would buy nothing — the two surfaces trigger differently (tap vs. scroll)
// and have no other motion to stay in sync with. Same visual mechanic, same
// reasons below, separate code.
//
// Word-by-word, not one box: an absolutely positioned overlay sized to a
// wrapped inline span is sized to the *union* of its line boxes, not to each
// line, and paints a rectangle across the whole quote rather than following
// the wrap. Each word gets its own small wash sibling instead, so each wash
// is exactly one line box — the same fix Act2Evaluation's HighlightedRun
// uses, for the same reason: a marking-point quote is routinely a full
// sentence, which wraps on a narrow results page just as readily as it does
// on the landing page.

import { useEffect, useRef } from "react";
import gsap from "gsap";

export function TapSweepHighlight({ text, wash }: { text: string; wash: string }) {
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const fills = root.querySelectorAll<HTMLElement>("[data-sweep-fill]");
    if (!fills.length) return;

    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set(fills, { scaleX: 1 });
    });

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      // The word spans already render scaleX(0) from the inline style above —
      // nothing to hide here on mount. This just draws it back out, the same
      // 180ms-per-word, word-staggered sweep Act 2 uses.
      const tween = gsap.to(fills, {
        scaleX: 1,
        duration: 0.18,
        ease: "power1.inOut",
        stagger: fills.length > 1 ? 0.34 / (fills.length - 1) : 0,
      });
      return () => {
        tween.kill();
      };
    });

    return () => mm.revert();
    // Re-fires whenever the quoted text itself changes — tapping a different
    // marking point reuses this component at the same position in the tree
    // (React doesn't remount it), so the effect dependency is what makes the
    // pen redraw for the new quote instead of silently doing nothing.
  }, [text]);

  const tokens = text.split(/(\s+)/).filter(Boolean);

  return (
    // The ref has to land on a real element, not a Fragment — a Fragment
    // never mounts a DOM node, so rootRef.current would stay null forever and
    // the effect above would exit on its very first line without ever
    // touching GSAP. `inline` display keeps this span from disrupting the
    // surrounding text flow; transform-gpu on the ancestor <p> in AnswerPanel
    // is what keeps this consistent with its plain-text neighbours.
    <span ref={rootRef} className="inline">
      {tokens.map((token, i) =>
        /^\s+$/.test(token) ? (
          <span key={i}>{token}</span>
        ) : (
          <span key={i} className="relative isolate inline-block leading-[1.35]">
            <span
              data-sweep-fill
              aria-hidden
              // The hidden state is an inline `transform`, not Tailwind's
              // scale-x-0 utility — those are not the same property. Tailwind
              // v4 writes scale-x-0 to the standalone CSS `scale` property,
              // while GSAP's scaleX tween (below) animates the legacy
              // `transform` matrix; the two compose (both apply at once), so
              // a scale-x-0 class leaves the element permanently at zero
              // width no matter what GSAP later sets `transform` to. Setting
              // the initial state on the same property GSAP animates avoids
              // that trap, and still paints hidden on the very first frame,
              // before any effect has run — no flash of the full highlight.
              style={{ transform: "scaleX(0)", transformOrigin: "left center" }}
              className={`absolute inset-y-0 -inset-x-[0.16em] -z-10 rounded-[2px] ${wash}`}
            />
            {token}
          </span>
        )
      )}
    </span>
  );
}
