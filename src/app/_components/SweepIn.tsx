"use client";

// A block that slides in from one side as it is scrolled to.
//
// Used for the two comparison cards, which come in from opposite edges and
// meet — the movement itself says "these two are being set against each
// other", which a pair of cards fading up in place does not.
//
// Unlike <Reveal>, the hidden state is not in CSS. Reveal can afford a CSS
// rule because it hides small pieces of text; this hides a whole card, and a
// card that starts 48px off its own axis is a card that can push the page
// sideways if the JS that was going to move it back never runs. So the server
// renders it in place and GSAP displaces it on the client, inside a
// matchMedia block, only when it is going to bring it back.

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CustomEase } from "gsap/CustomEase";

gsap.registerPlugin(ScrollTrigger, CustomEase);

const EASE = "editorial";
if (!CustomEase.get(EASE)) CustomEase.create(EASE, "M0,0 C0.16,1 0.3,1 1,1");

const DISTANCE_PX = 48;

export function SweepIn({
  from,
  className,
  children,
}: {
  from: "left" | "right";
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const offset = from === "left" ? -DISTANCE_PX : DISTANCE_PX;
      gsap.set(el, { opacity: 0, x: offset });

      const tween = gsap.to(el, {
        opacity: 1,
        x: 0,
        // Longer than the 320ms entrance base — this is a whole card crossing
        // 48px, and at 320ms that reads as a jump rather than a glide.
        duration: 0.7,
        ease: EASE,
        scrollTrigger: { trigger: el, start: "top 85%", once: true },
      });

      // Same guard as the rest of the page's motion: a tab opened in the
      // background never fires rAF, so this tween can sit at zero progress
      // with the card plainly on screen and 48px out of place. Only forced
      // when the card is actually in view — below the fold, not having moved
      // yet is the correct state.
      const failsafe = window.setTimeout(() => {
        const box = el.getBoundingClientRect();
        const onScreen = box.top < window.innerHeight && box.bottom > 0;
        if (onScreen && tween.progress() === 0) gsap.set(el, { opacity: 1, x: 0 });
      }, 3000);

      return () => {
        window.clearTimeout(failsafe);
        tween.scrollTrigger?.kill();
        tween.kill();
        gsap.set(el, { clearProps: "all" });
      };
    });

    return () => mm.revert();
  }, [from]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
