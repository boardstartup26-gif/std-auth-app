// One row per notification. Each row is a form button rather than a link, so
// a notification is marked read when the student opens it, not when the
// browser prefetches it.

import type { NotificationItem, NotificationKind } from "@/lib/notifications/constants";
import { openNotificationAction } from "../actions";

const KIND_LABEL: Record<NotificationKind, string> = {
  reattempt: "Try again",
  board_plan: "Board plan",
  system: "BoardEdge",
};

/** "Today", "Yesterday", or "24 Sep", by the IST calendar. */
function dayLabel(iso: string, now: Date): string {
  const fmt = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const day = fmt(new Date(iso));
  if (day === fmt(now)) return "Today";
  if (day === fmt(new Date(now.getTime() - 86_400_000))) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
  });
}

export function NotificationList({ items, now }: { items: NotificationItem[]; now: Date }) {
  return (
    <ul className="mt-10 border-b border-rule">
      {items.map((n) => {
        const isUnread = !n.readAt;
        return (
          <li key={n.id} className="border-t border-rule">
            <form action={openNotificationAction}>
              <input type="hidden" name="id" value={n.id} />
              <button
                type="submit"
                className="group grid w-full grid-cols-[1rem_1fr_auto] items-start gap-3 py-5 text-left transition-colors hover:bg-surface-raised/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:px-2"
              >
                <span className="mt-2 flex justify-center" aria-hidden>
                  {isUnread ? <span className="h-2 w-2 rounded-full bg-accent" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {KIND_LABEL[n.kind] ?? "BoardEdge"}
                    {isUnread ? <span className="sr-only"> (unread)</span> : null}
                  </span>
                  <span
                    className={`mt-1 block text-[15px] leading-snug text-foreground ${
                      isUnread ? "font-semibold" : "font-medium"
                    }`}
                  >
                    {n.title}
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{n.body}</span>
                  {n.href ? (
                    <span className="mt-2 inline-block text-sm font-medium text-accent group-hover:underline group-hover:underline-offset-2">
                      Open question →
                    </span>
                  ) : null}
                </span>
                <span className="whitespace-nowrap pt-0.5 text-xs text-muted-foreground">
                  {dayLabel(n.createdAt, now)}
                </span>
              </button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
