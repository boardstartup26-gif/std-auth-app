"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { setEmailReminders, verifyUnsubscribeToken } from "@/lib/email/reminder-preferences";
import { EVENTS } from "@/lib/analytics/events";
import { recordServerEvent } from "@/lib/analytics/server";

/** Turns reminder emails off for the account the signed link belongs to. */
export async function confirmUnsubscribe(formData: FormData) {
  const token = String(formData.get("t") ?? "");
  const userId = verifyUnsubscribeToken(token);
  if (!userId) redirect("/unsubscribe?status=invalid");

  const ok = await setEmailReminders(userId, false);
  if (!ok) redirect(`/unsubscribe?t=${encodeURIComponent(token)}&status=error`);

  after(() =>
    recordServerEvent({
      eventName: EVENTS.EMAIL_REMINDERS_CHANGED,
      userId,
      properties: { enabled: false, via: "email_link" },
      path: "/unsubscribe",
    }),
  );
  redirect("/unsubscribe?status=done");
}
