"use client";

// The landing page's entrance motion (handoff §4): opacity 0→1, y 16→0, 320ms
// on the editorial easing, 60ms between siblings.
//
// Hidden state lives in CSS, not here. If this component set the initial
// opacity itself, the server-rendered HTML would paint fully visible and then
// blink out on hydration — so globals.css hides `[data-reveal]` at first paint
// and GSAP only ever animates *toward* visible. Two consequences worth keeping:
//
//   - The hide rule is wrapped in `prefers-reduced-motion: no-preference`, so a
//     visitor who asked for less motion never has content hidden from them in
//     the first place, whatever happens to the JavaScript.
//   - A <noscript> override in the page restores visibility when JS never runs.
//     Without it a script failure would leave a blank marketing page.
//
// GSAP rather than an IntersectionObserver because §4 names it, and Act 2's
// pinned scrub genuinely needs ScrollTrigger — one motion system on the page
// beats two. It is imported only here, in a client component, so the page
// itself stays a static prerender.

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CustomEase } from "gsap/CustomEase";

gsap.registerPlugin(ScrollTrigger, CustomEase);

// --ease-editorial is cubic-bezier(0.16, 1, 0.3, 1), and GSAP's named eases
// have no exact equivalent — "expo.out" is close but not the same curve. This
// registers the real one so the JS motion and the CSS transitions elsewhere in
// the app (which use the token directly) are the same movement, not two things
// that nearly match.
const EASE_EDITORIAL = "editorial";
if (!CustomEase.get(EASE_EDITORIAL)) {
  CustomEase.create(EASE_EDITORIAL, "M0,0 C0.16,1 0.3,1 1,1");
}

export function Reveal({
  children,
  /** Act 0 runs on load; every other act waits until it is scrolled to. */
  onLoad = false,
  /** Display type gets the slower 560ms duration (§4). */
  slow = false,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  onLoad?: boolean;
  slow?: boolean;
  className?: string;
  as?: "div" | "section" | "header" | "footer" | "dl";
}) {
  const scope = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = scope.current;
    if (!root) return;

    const targets = root.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!targets.length) return;

    const mm = gsap.matchMedia();

    // Reduced motion: jump straight to the end state. The CSS never hid these
    // for this visitor, so this is belt-and-braces — it also covers someone who
    // flips the OS setting while the page is open.
    mm.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set(targets, { opacity: 1, y: 0 });
    });

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const tween = gsap.to(targets, {
        opacity: 1,
        y: 0,
        duration: slow ? 0.56 : 0.32,
        ease: EASE_EDITORIAL,
        stagger: 0.06,
        ...(onLoad
          ? {}
          : {
              scrollTrigger: {
                trigger: root,
                // Fires a little before the section is fully in view, so the
                // motion reads as the section arriving rather than as content
                // popping in after the reader is already looking at it.
                start: "top 85%",
                once: true,
              },
            }),
      });

      // Fraunces is a web font, and the display sizes on this page are large
      // enough that swapping it in moves sections by hundreds of pixels.
      // ScrollTrigger measures start positions when it is created — if that
      // happens before the font lands, every trigger below the fold is pinned
      // to a stale position and fires at the wrong time (or not at all).
      let refreshed = false;
      const refresh = () => {
        if (!refreshed) {
          refreshed = true;
          ScrollTrigger.refresh();
        }
      };
      document.fonts?.ready.then(refresh).catch(() => {});

      // Failsafe for the on-load act only. Its content is hidden by CSS and
      // revealed solely by this tween, so a page opened in a background tab —
      // where rAF never fires and GSAP sits frozen at t=0 — shows a blank
      // masthead rather than merely an unanimated one.
      //
      // Deliberately NOT applied to the scrolled acts: for those, progress 0
      // after three seconds is the correct state for anything the reader has
      // not reached yet, and forcing them visible would reveal the whole page
      // at once and delete the effect. They need no guard anyway — a scroll
      // reveal can only matter to someone actively scrolling, which means a
      // visible tab with rAF already running.
      const failsafe = onLoad
        ? window.setTimeout(() => {
            if (tween.progress() === 0) gsap.set(targets, { opacity: 1, y: 0 });
          }, 3000)
        : undefined;

      return () => {
        if (failsafe !== undefined) window.clearTimeout(failsafe);
        tween.scrollTrigger?.kill();
        tween.kill();
      };
    });

    return () => mm.revert();
  }, [onLoad, slow]);

  return (
    <Tag ref={scope as React.Ref<never>} className={className}>
      {children}
    </Tag>
  );
}
