"use server";

// The parent's own switch for weekly reports, reached from a signed link
// (src/lib/parent-report/token.ts). No login: the parent has no account. The
// token is re-verified here against the parent address currently on file —
// the page having rendered proves nothing about the POST.

import { after } from "next/server";
import { redirect } from "next/navigation";
import { parentReportsLive, resolveReportLink, setParentReports } from "@/lib/parent-report/service";
import { EVENTS } from "@/lib/analytics/events";
import { recordServerEvent } from "@/lib/analytics/server";

export async function changeParentReports(formData: FormData) {
  const token = String(formData.get("t") ?? "");
  const purpose = formData.get("a") === "on" ? "on" : "off";
  const back = (status: string) =>
    `/parent-reports?t=${encodeURIComponent(token)}&a=${purpose}&status=${status}`;

  // Turning on is refused while the feature is off; stopping always works.
  if (purpose === "on" && !parentReportsLive()) redirect(back("unavailable"));

  const link = await resolveReportLink(purpose, token);
  if (!link) redirect("/parent-reports?status=invalid");
  if (purpose === "on" && link.state === "unavailable") redirect(back("unavailable"));

  const ok = await setParentReports(link.userId, link.parentEmail, purpose === "on");
  if (!ok) redirect(back("error"));

  const userId = link.userId;
  after(() =>
    recordServerEvent({
      eventName: EVENTS.PARENT_REPORTS_CHANGED,
      userId,
      properties: { enabled: purpose === "on", via: "email_link" },
      path: "/parent-reports",
    }),
  );
  redirect(back("done"));
}
