// The row of preparation shortcuts under the primary actions: Weekly Board
// Plan, Fix List, Leakage Map, Reattempt Gain, Parent Report, Invite Friends.
// Each tile is a link to where that feature already lives, with one short
// caption taken from the student's own data. The page decides which tiles
// exist (a tile with nothing behind it is left out), so this only lays them out.

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { dashCard, tileInteractive } from "../_lib/styles";

export interface ToolTile {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
  /** One short fact from real data, or null to show the label alone. */
  caption: string | null;
}

// Static class names so Tailwind can see them; 3 per row on phones.
const COLS: Record<number, string> = {
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
  5: "sm:grid-cols-5",
  6: "sm:grid-cols-6",
};

export function ToolShortcuts({ tiles }: { tiles: ToolTile[] }) {
  if (!tiles.length) return null;
  return (
    <nav aria-label="Preparation tools" className="mt-4">
      <ul className={`grid grid-cols-3 gap-3 ${COLS[tiles.length] ?? "sm:grid-cols-6"}`}>
        {tiles.map(({ key, href, label, icon: Icon, caption }) => (
          <li key={key}>
            <Link
              href={href}
              className={`${dashCard} ${tileInteractive} flex h-full min-h-[6.25rem] flex-col items-center justify-center gap-1.5 px-2 py-3.5 text-center`}
            >
              <Icon size={22} strokeWidth={1.6} aria-hidden className="text-accent" />
              <span className="text-[12.5px] font-medium leading-tight text-foreground">{label}</span>
              {caption ? (
                <span className="text-[11px] leading-tight text-muted-foreground tabular-nums">{caption}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
