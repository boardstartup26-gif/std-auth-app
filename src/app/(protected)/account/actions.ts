"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { setEmailReminders } from "@/lib/email/reminder-preferences";
import { EVENTS } from "@/lib/analytics/events";
import { recordServerEvent } from "@/lib/analytics/server";

export async function updateEmailReminders(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account");

  const enabled = formData.get("enabled") === "true";
  const ok = await setEmailReminders(user.id, enabled);
  if (ok) {
    const userId = user.id;
    after(() =>
      recordServerEvent({
        eventName: EVENTS.EMAIL_REMINDERS_CHANGED,
        userId,
        properties: { enabled, via: "account" },
        path: "/account",
      }),
    );
  }
  revalidatePath("/account");
}
