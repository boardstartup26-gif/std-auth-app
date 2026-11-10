"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { setEmailReminders } from "@/lib/email/reminder-preferences";
import {
  claimInviteSlot,
  parentReportsLive,
  readReportRow,
  readStudentFirstName,
  reportState,
} from "@/lib/parent-report/service";
import { sendReportInvite } from "@/lib/parent-report/email";
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

/**
 * Emails the parent who confirmed consent an invite to weekly summaries. The
 * invite does nothing by itself: the parent opts in from its link. At most
 * once a day per student (claimed atomically on the consent row).
 */
export async function inviteParentToReports() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account");
  if (!parentReportsLive()) redirect("/account?report=unavailable#parent-report");

  const row = await readReportRow(user.id);
  const state = reportState(row);
  if (state === "unavailable" || !row?.parentEmail) redirect("/account?report=unavailable#parent-report");
  if (state === "on") redirect("/account#parent-report");

  if (!(await claimInviteSlot(user.id))) redirect("/account?report=cooldown#parent-report");

  const result = await sendReportInvite({
    userId: user.id,
    to: row.parentEmail,
    firstName: await readStudentFirstName(user.id),
  });
  if (!result.ok) {
    console.error("[BoardEdge] parent report invite send failed:", result.reason);
    redirect("/account?report=error#parent-report");
  }

  const userId = user.id;
  after(() =>
    recordServerEvent({ eventName: EVENTS.PARENT_REPORT_INVITED, userId, properties: {}, path: "/account" }),
  );
  redirect("/account?report=sent#parent-report");
}
