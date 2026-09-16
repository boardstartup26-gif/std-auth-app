"use client";

// A call-to-action that leans a few pixels toward the pointer.
//
// 3px, against the dashboard cards' 4.2 — a button is small and its label sits
// inside it, so the same pull that reads as "weight" on a 188px card reads as
// "text wobbling" on a 48px button. Transform only, per handoff §4.
//
// Mouse pointers only. A finger is either down or gone, and there is no hover
// state to track; following a touch would slide the target out from under the
// tap. Every other path — keyboard focus, coarse pointer, reduced motion —
// gets an ordinary, motionless button, which is why the pull lives in an
// inline transform rather than in the shared class strings.

import { useCallback, useRef, useState } from "react";
import Link from "next/link";

const MAX_SHIFT_PX = 3;

export function MagneticButton({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [pull, setPull] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLAnchorElement>) => {
    if (e.pointerType !== "mouse") return;
    // Checked here rather than left to `motion-reduce:transform-none`: the pull
    // is an inline style, and an inline transform beats any class that tries to
    // cancel it.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // -1..1 from the button's own centre, so a button at the edge of the
    // viewport behaves exactly like one in the middle.
    const nx = (e.clientX - r.left) / r.width - 0.5;
    const ny = (e.clientY - r.top) / r.height - 0.5;
    setPull({ x: nx * 2 * MAX_SHIFT_PX, y: ny * 2 * MAX_SHIFT_PX });
    setActive(true);
  }, []);

  const release = useCallback(() => {
    setPull({ x: 0, y: 0 });
    setActive(false);
  }, []);

  // mailto: and external hrefs are not routes — next/link has nothing to
  // prefetch or navigate for them, so they render as a plain anchor.
  const Tag = /^(mailto:|tel:|https?:)/.test(href) ? "a" : Link;

  return (
    <Tag
      ref={ref}
      href={href}
      onPointerMove={onPointerMove}
      onPointerLeave={release}
      onBlur={release}
      className={className}
      style={{
        transform: `translate3d(${pull.x}px, ${pull.y}px, 0)`,
        // Tracking is near-instant; the release is the editorial ease, so the
        // button follows the cursor but settles rather than snapping.
        transition: active
          ? "transform 90ms linear"
          : "transform var(--duration-base, 320ms) var(--ease-editorial, cubic-bezier(0.16,1,0.3,1))",
      }}
    >
      {children}
    </Tag>
  );
}
