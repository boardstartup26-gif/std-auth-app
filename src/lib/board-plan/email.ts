// src/lib/board-plan/email.ts
//
// The Monday email for the Weekly Board Plan, to the student's own address
// only (never a parent). Same visual language, signed unsubscribe link and
// RFC 8058 one-click headers as the reattempt reminder, and governed by the
// same `profiles.email_reminders` switch — one "stop reminder emails" covers
// both, so there's no second preference to keep in step.

import { escapeHtml, sendEmail, type SendResult } from "@/lib/email/send";
import { unsubscribeLinks } from "@/lib/email/reminder-preferences";
import { getSiteUrl } from "@/lib/site-url";
import { withReturnSource } from "@/lib/notifications/service";
import { taskCopy, type PlanTask } from "./tasks";

export async function sendBoardPlanEmail({
  userId,
  to,
  firstName,
  tasks,
}: {
  userId: string;
  to: string;
  firstName: string | null;
  tasks: PlanTask[];
}): Promise<SendResult> {
  const siteUrl = getSiteUrl();
  const unsubscribe = unsubscribeLinks(userId);
  if (!siteUrl || !unsubscribe) {
    console.error("[BoardEdge] NEXT_PUBLIC_SITE_URL is not set; skipping board plan email.");
    return { ok: false, reason: "site_url_unavailable" };
  }
  if (!tasks.length) return { ok: false, reason: "nothing_to_send" };

  const name = (firstName ?? "").trim().slice(0, 40);
  const greeting = name ? `Hi ${name},` : "Hi,";
  // Every link goes to the dashboard card, where each task's own action and
  // live progress are. The Fix List task is a form there, not a link.
  const planLink = `${siteUrl}${withReturnSource("/dashboard#board-plan", "email")}`;
  const items = tasks.map((t) => taskCopy(t));
  const subject = "Your board plan for this week";
  const intro = "Three things for this week, picked from the marks you've been losing. They tick themselves off as you do them.";

  const text = [
    greeting,
    "",
    intro,
    "",
    ...items.map((c, i) => `${i + 1}. ${c.title} — ${c.detail}`),
    "",
    `See your plan and progress: ${planLink}`,
    "",
    "— BoardEdge",
    "",
    `Stop reminder emails: ${unsubscribe.page}`,
  ].join("\n");

  const rows = items
    .map(
      (c, i) => `
      <tr>
        <td style="padding:14px 12px 14px 0;border-top:1px solid #E4E1D8;vertical-align:top;font-family:Georgia,serif;font-size:20px;color:#C43D2B;width:24px;">${i + 1}</td>
        <td style="padding:14px 0;border-top:1px solid #E4E1D8;">
          <div style="font-size:16px;font-weight:600;color:#16181D;">${escapeHtml(c.title)}</div>
          <div style="font-size:13px;line-height:1.5;color:#5C6068;margin-top:4px;">${escapeHtml(c.detail)}</div>
        </td>
      </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html><body style="margin:0;background:#FAF9F5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16181D;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5C6068;margin:0 0 16px;">BoardEdge · Weekly board plan</p>
    <h1 style="font-family:Georgia,serif;font-weight:500;font-size:26px;line-height:1.2;margin:0 0 16px;">${escapeHtml(greeting)} here&rsquo;s your plan for this week</h1>
    <p style="font-size:16px;line-height:1.6;margin:0 0 20px;">${escapeHtml(intro)}</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-bottom:1px solid #E4E1D8;margin:0 0 24px;">${rows}
    </table>
    <p style="margin:0 0 28px;"><a href="${escapeHtml(planLink)}" style="display:inline-block;background:#C43D2B;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;padding:12px 20px;border-radius:10px;">Open my plan</a></p>
    <p style="font-size:12px;line-height:1.6;color:#8A8D93;margin:0;">You&rsquo;re getting this because you practised on BoardEdge. <a href="${escapeHtml(unsubscribe.page)}" style="color:#8A8D93;">Stop reminder emails</a></p>
  </div>
</body></html>`;

  return sendEmail({
    to,
    subject,
    text,
    html,
    headers: {
      "List-Unsubscribe": `<${unsubscribe.oneClick}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}
