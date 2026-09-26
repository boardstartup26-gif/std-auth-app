"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { markAllRead, openNotification, withReturnSource } from "@/lib/notifications/service";
import { safeNextPath } from "@/lib/safe-next";
import { EVENTS } from "@/lib/analytics/events";
import { recordServerEvent } from "@/lib/analytics/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Opening a notification is a form POST, not a link: a link that marked
 * things read would do it on prefetch, before the student ever tapped it.
 */
export async function openNotificationAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/notifications");

  const id = String(formData.get("id") ?? "");
  if (!UUID_RE.test(id)) redirect("/notifications");

  const opened = await openNotification(user.id, id);
  revalidatePath("/", "layout");
  if (!opened) redirect("/notifications");

  const userId = user.id;
  after(() =>
    recordServerEvent({
      eventName: EVENTS.NOTIFICATION_OPENED,
      userId,
      properties: { kind: opened.kind, notification_id: id },
      path: "/notifications",
    }),
  );

  // The table's CHECK already restricts href to internal paths; validated
  // again here because this is the value handed to redirect().
  const target = opened.href ? safeNextPath(opened.href) : null;
  redirect(target ? withReturnSource(target, "notification") : "/notifications");
}

export async function markAllReadAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/notifications");

  await markAllRead(user.id);
  revalidatePath("/", "layout");
}
