"use client";

// Tabs between the four progress views. A client component only for
// usePathname (the active tab); every destination is a plain server page.
// Scrolls sideways on narrow screens instead of wrapping.

import Link from "next/link";
import { usePathname } from "next/navigation";

export const PROGRESS_SECTIONS = [
  { href: "/progress", label: "Overview" },
  { href: "/progress/fix-list", label: "Fix List" },
  { href: "/progress/leakage", label: "Leakage Map" },
  { href: "/progress/reattempt-gain", label: "Reattempt Gain" },
] as const;

export function ProgressNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Progress sections" className="-mx-4 mt-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-border">
        {PROGRESS_SECTIONS.map(({ href, label }) => {
          const active = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`-mb-px inline-block border-b-2 px-3 py-2.5 text-[13.5px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  active
                    ? "border-accent text-accent"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
