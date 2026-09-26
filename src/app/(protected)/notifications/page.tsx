// src/app/(protected)/notifications/page.tsx
//
// The in-app inbox: the second delivery route, next to email, for every
// return trigger. Today that is Spaced Reattempt Prompts; the Weekly Board
// Plan will land here too.
//
// Each row is a form button rather than a link, so a notification is marked
// read when the student opens it, not when the browser prefetches it.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listNotifications } from "@/lib/notifications/service";
import { errorAlert, sectionLabel } from "@/lib/ui";
import { markAllReadAction } from "./actions";
import { NotificationList } from "./_components/NotificationList";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/notifications");

  const items = await listNotifications(user.id);
  const unread = items?.filter((n) => !n.readAt).length ?? 0;
  const now = new Date();

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <p className={sectionLabel}>BoardEdge</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <h1 className="display-section">Notifications</h1>
        {unread > 0 ? (
          <form action={markAllReadAction}>
            <button
              type="submit"
              className="text-sm text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              Mark all as read
            </button>
          </form>
        ) : null}
      </div>
      <p className="mt-4 max-w-[var(--measure)] text-muted-foreground">
        When an answer you dropped marks on is due for another go, it shows up here. Rewriting it
        a day, three days and a week later is what makes the missing points stick.
      </p>

      {items === null ? (
        <p className={`${errorAlert} mt-10`} role="alert">
          We couldn&rsquo;t load your notifications just now. Please refresh in a moment.
        </p>
      ) : items.length === 0 ? (
        <div className="mt-10 border-t border-rule pt-8">
          <p className="font-display text-lg text-foreground">Nothing here yet.</p>
          <p className="mt-2 max-w-[var(--measure)] text-sm text-muted-foreground">
            Answer a written question, and if any marks slip away, you&rsquo;ll get a nudge here
            the next day to win them back.
          </p>
        </div>
      ) : (
        <NotificationList items={items} now={now} />
      )}
    </div>
  );
}
