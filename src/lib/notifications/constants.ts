// src/lib/notifications/constants.ts
//
// Client-safe shapes for the in-app inbox. Server reads and writes live in
// ./service and ./reattempt, which import the Supabase server client and must
// never reach a client bundle.

/** Mirrors notifications_kind_check in 20260926120000_notifications.sql. */
export type NotificationKind = "reattempt" | "board_plan" | "system";

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string | null;
  createdAt: string;
  readAt: string | null;
}

/**
 * Appended to a notification's href as `src=` so an evaluation can be
 * attributed to the channel that brought the student back.
 */
export type ReturnSource = "notification" | "email";
