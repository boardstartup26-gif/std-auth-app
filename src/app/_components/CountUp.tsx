"use client";

// A figure that counts up to itself when it is scrolled to.
//
// Two seconds, heavily decelerated: most of the range is covered in the first
// half-second and the last few hundred crawl in. That shape is the point — a
// linear count reads as a progress bar, an eased one reads as a number
// arriving. The suffix ("+") lands only once the count does, so the page never
// briefly claims "1,204+".
//
// The finished value is what the server renders. GSAP resets it to zero on the
// client, inside a matchMedia block, so a visitor with reduced motion, without
// JavaScript, or on a page opened in a background tab (where rAF never fires
// and a tween sits frozen at zero) reads the real figure rather than "0".
// Nothing here is hidden by CSS that JS then has to undo.

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function CountUp({
  to,
  suffix,
  duration = 2,
  className,
}: {
  to: number;
  /** Rendered after the count lands — never during it. */
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const valueRef = useRef<HTMLSpanElement>(null);
  const suffixRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const value = valueRef.current;
    if (!value) return;

    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const counter = { n: 0 };
      const write = () => {
        value.textContent = Math.round(counter.n).toLocaleString("en-IN");
      };
      write();
      if (suffixRef.current) gsap.set(suffixRef.current, { opacity: 0 });

      const tl = gsap.timeline({
        scrollTrigger: { trigger: value, start: "top 85%", once: true },
      });

      tl.to(counter, { n: to, duration, ease: "power3.out", onUpdate: write });
      if (suffixRef.current) {
        tl.to(suffixRef.current, { opacity: 1, duration: 0.2 }, ">-0.05");
      }

      // Background tabs never fire requestAnimationFrame, so this tween can sit
      // at zero while the element is plainly on screen — and since JS has
      // already replaced the server's real figure with "0", the page would show
      // "0 past-paper questions".
      //
      // The condition is "on screen and still at zero", not just "still at
      // zero": below the fold, zero after three seconds is the correct state
      // for a figure the reader has not reached, and forcing it would spend the
      // count where nobody is looking.
      const failsafe = window.setTimeout(() => {
        const box = value.getBoundingClientRect();
        const onScreen = box.top < window.innerHeight && box.bottom > 0;
        if (onScreen && counter.n === 0) {
          counter.n = to;
          write();
          if (suffixRef.current) gsap.set(suffixRef.current, { opacity: 1 });
        }
      }, 3000);

      return () => {
        window.clearTimeout(failsafe);
        tl.scrollTrigger?.kill();
        tl.kill();
        // Restore exactly what the server rendered, so a media-query flip
        // leaves the real figure on screen rather than a frozen partial count.
        value.textContent = to.toLocaleString("en-IN");
        if (suffixRef.current) gsap.set(suffixRef.current, { clearProps: "all" });
      };
    });

    return () => mm.revert();
  }, [to, duration]);

  return (
    <span className={className}>
      <span ref={valueRef}>{to.toLocaleString("en-IN")}</span>
      {suffix ? <span ref={suffixRef}>{suffix}</span> : null}
    </span>
  );
}
