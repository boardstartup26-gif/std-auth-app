// src/app/_components/TopBar.tsx
//
// A thin hairline bar above every signed-in page, carrying the credit balance.
// It exists so the balance has one home: before this it was a rail entry on the
// dashboard and a separate readout inside /evaluate, which meant two different
// numbers could be on screen at once after a submission.
//
// Deliberately sparse. A notifications bell and an avatar menu would match the
// reference more closely, but neither feature exists — the account page is
// already one click away in the sidebar, and chrome that does nothing when
// clicked is worse than no chrome.

import { CreditsPill } from "./CreditsPill";
import type { CreditBalance } from "@/lib/credits";

export function TopBar({ credits }: { credits: CreditBalance | null }) {
  return (
    <header className="sticky top-0 z-20 hidden h-14 shrink-0 items-center justify-end gap-3 border-b border-border bg-background/95 px-6 backdrop-blur md:flex">
      {credits ? <CreditsPill credits={credits} /> : null}
    </header>
  );
}
