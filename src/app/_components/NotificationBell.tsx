// src/app/_components/NotificationBell.tsx
//
// The bell in the top bar (desktop) and the mobile header. A plain link to the
// inbox with an unread count: no dropdown, because on a phone, the primary
// device, a popover of three-line prompts is harder to read than a page.
//
// The count comes from the (protected) layout, which doesn't re-render on
// every client navigation. Opening or clearing notifications revalidates the
// layout, so the badge only goes stale when something new arrives mid-visit,
// and the cron only runs once a day.

import Link from "next/link";
import { Bell } from "lucide-react";

export function NotificationBell({ unread }: { unread: number }) {
  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";
  return (
    <Link
      href="/notifications"
      aria-label={label}
      title={label}
      className="relative inline-grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <Bell size={18} strokeWidth={1.75} aria-hidden />
      {unread > 0 ? (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold tabular-nums leading-none text-background"
        >
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
