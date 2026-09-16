"use client";

// The masthead's section links, with a hover state and an active state.
//
// Active means "this is the section you are reading", resolved by watching the
// sections themselves rather than the URL hash: the hash only changes when a
// link is clicked, so a reader who scrolled there — which is most of them —
// would never see anything light up.
//
// The rule underneath is drawn with scaleX rather than by animating width or a
// border, so it composites (§4) and so the two states differ by a transform
// the browser can interpolate: hover grows it from the left, active holds it.

import { useEffect, useState } from "react";

const LINKS = [
  { href: "#evaluation", label: "How it marks" },
  { href: "#provenance", label: "Coverage" },
  { href: "#trajectory", label: "Progress" },
  { href: "#faq", label: "FAQs" },
];

export function NavLinks() {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const sections = LINKS.map((l) => document.querySelector(l.href)).filter(
      (el): el is Element => !!el
    );
    if (!sections.length) return;

    // The band is the top third of the viewport: a section counts as "being
    // read" once its top has come up past the masthead, not when it first
    // peeks in from the bottom. Without the negative bottom margin, the last
    // section on a long page can never win, because the one above it is still
    // intersecting too.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length) setActive(`#${visible[0].target.id}`);
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 }
    );

    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  return (
    <nav className="hidden items-center gap-8 text-sm sm:flex">
      {LINKS.map((link) => {
        const isActive = active === link.href;
        return (
          <a
            key={link.href}
            href={link.href}
            aria-current={isActive ? "true" : undefined}
            className={`group relative py-1 transition-colors ${
              isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {link.label}
            <span
              aria-hidden
              className={`absolute inset-x-0 -bottom-0.5 h-px origin-left bg-accent transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
                isActive ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
              }`}
            />
          </a>
        );
      })}
    </nav>
  );
}
