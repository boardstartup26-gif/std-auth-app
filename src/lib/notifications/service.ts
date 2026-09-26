// src/lib/notifications/service.ts
//
// Reading and marking the in-app inbox. Server-only.
//
// Reads go through the session client, so RLS (notifications_select_own) is
// what scopes them. Writes — marking read — have no client grant at all and go
// through the service-role client, always filtered on the verified user id as
// well as the row id, so one student can never touch another's rows even if a
// notification id leaks.

import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { NotificationItem, NotificationKind, ReturnSource } from "./constants";

const LIST_LIMIT = 50;

/** Unread count for the bell. Zero on error: a missing badge beats a broken shell. */
export async function readUnreadCount(userId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) {
    console.warn("[BoardEdge] notification count failed:", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function listNotifications(userId: string): Promise<NotificationItem[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, title, body, href, created_at, read_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (error) {
    console.error("[BoardEdge] notification list failed:", error.message);
    return null;
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    kind: row.kind as NotificationKind,
    title: row.title as string,
    body: row.body as string,
    href: (row.href as string | null) ?? null,
    createdAt: row.created_at as string,
    readAt: (row.read_at as string | null) ?? null,
  }));
}

/**
 * Marks one notification read and returns where it points, or null if it
 * doesn't exist for this user. Re-opening a read notification is fine — the
 * original read_at is kept.
 */
export async function openNotification(
  userId: string,
  notificationId: string,
): Promise<{ href: string | null; kind: NotificationKind } | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notifications")
    .select("href, kind, read_at")
    .eq("id", notificationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("[BoardEdge] notification open failed:", error.message);
    return null;
  }

  if (!data.read_at) {
    const { error: updateError } = await admin
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("user_id", userId);
    if (updateError) console.warn("[BoardEdge] notification mark-read failed:", updateError.message);
  }

  return { href: (data.href as string | null) ?? null, kind: data.kind as NotificationKind };
}

export async function markAllRead(userId: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) console.error("[BoardEdge] notification mark-all-read failed:", error.message);
}

/** Tags an internal href with the channel that delivered it. */
export function withReturnSource(href: string, source: ReturnSource): string {
  return `${href}${href.includes("?") ? "&" : "?"}src=${source}`;
}
