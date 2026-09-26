// src/app/_components/TopBar.tsx
//
// A thin hairline bar above every signed-in page, carrying the credit balance
// and the notifications bell. It exists so the balance has one home: before
// this it was a rail entry on the dashboard and a separate readout inside
// /evaluate, which meant two different numbers could be on screen at once
// after a submission.
//
// Deliberately sparse. An avatar menu would match the reference more closely,
// but the account page is already one click away in the sidebar, and chrome
// that does nothing when clicked is worse than no chrome.

import { CreditsPill } from "./CreditsPill";
import { NotificationBell } from "./NotificationBell";
import type { CreditBalance } from "@/lib/credits";

export function TopBar({ credits, unread }: { credits: CreditBalance | null; unread: number }) {
  return (
    <header className="sticky top-0 z-20 hidden h-14 shrink-0 items-center justify-end gap-3 border-b border-border bg-background/95 px-6 backdrop-blur md:flex">
      <NotificationBell unread={unread} />
      {credits ? <CreditsPill credits={credits} /> : null}
    </header>
  );
}
