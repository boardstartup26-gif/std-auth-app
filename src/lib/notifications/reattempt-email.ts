// src/lib/notifications/reattempt-email.ts
//
// The email half of a Spaced Reattempt Prompt: one short digest to the
// student's own address listing the questions that came due in this run.
// Never to a parent.
//
// Every one carries a visible unsubscribe link and RFC 8058 one-click
// List-Unsubscribe headers. Turning reminders off stops these emails only; the
// in-app prompts carry on.

import { escapeHtml, sendEmail, type SendResult } from "@/lib/email/send";
import { unsubscribeLinks } from "@/lib/email/reminder-preferences";
import { getSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/server";
import { withReturnSource } from "./service";
import { formatMarks, questionLabel, reattemptHref } from "./reattempt-copy";
import type { ReattemptCandidate } from "./reattempt";

export interface EmailPrefs {
  email: string | null;
  firstName: string | null;
  remindersOn: boolean;
}

export async function readEmailPrefs(userId: string): Promise<EmailPrefs> {
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("email, first_name, email_reminders")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.warn("[BoardEdge] reminder prefs read failed:", error.message);
    // Unknown preference: don't email. Missing a reminder is recoverable;
    // mailing someone who opted out is not.
    return { email: null, firstName: null, remindersOn: false };
  }
  return {
    email: (data.email as string | null) ?? null,
    firstName: (data.first_name as string | null) ?? null,
    remindersOn: (data.email_reminders as boolean | null) ?? true,
  };
}

export async function sendReattemptEmail({
  userId,
  to,
  firstName,
  prompts,
}: {
  userId: string;
  to: string;
  firstName: string | null;
  prompts: ReattemptCandidate[];
}): Promise<SendResult> {
  const siteUrl = getSiteUrl();
  const unsubscribe = unsubscribeLinks(userId);
  if (!siteUrl || !unsubscribe) {
    console.error("[BoardEdge] NEXT_PUBLIC_SITE_URL is not set; skipping reattempt email.");
    return { ok: false, reason: "site_url_unavailable" };
  }
  if (!prompts.length) return { ok: false, reason: "nothing_to_send" };

  const name = (firstName ?? "").trim().slice(0, 40);
  const greeting = name ? `Hi ${name},` : "Hi,";
  const lost = prompts.reduce((sum, p) => sum + (p.total - p.awarded), 0);
  const one = prompts.length === 1;

  const subject = one
    ? `Worth another go: ${questionLabel(prompts[0])}`
    : `${prompts.length} answers worth another go`;
  const intro = one
    ? `You dropped ${formatMarks(lost)} ${lost === 1 ? "mark" : "marks"} on this one. Rewriting it now is the quickest way to make sure you don't drop them in the exam.`
    : `You dropped ${formatMarks(lost)} marks across these. Rewriting them now is the quickest way to make sure you don't drop them in the exam.`;

  const items = prompts.map((p) => ({
    label: questionLabel(p),
    score: `${formatMarks(p.awarded)}/${formatMarks(p.total)}`,
    link: `${siteUrl}${withReturnSource(reattemptHref(p), "email")}`,
  }));

  const text = [
    greeting,
    "",
    intro,
    "",
    ...items.map((i) => `- ${i.label} (you scored ${i.score}): ${i.link}`),
    "",
    "Each one is marked against the same official scheme, so you'll see straight away whether the missing points are in.",
    "",
    "— BoardEdge",
    "",
    `Stop these reminder emails: ${unsubscribe.page}`,
  ].join("\n");

  const rows = items
    .map(
      (i) => `
      <tr>
        <td style="padding:14px 0;border-top:1px solid #E4E1D8;">
          <a href="${escapeHtml(i.link)}" style="color:#16181D;text-decoration:none;font-size:16px;font-weight:600;">${escapeHtml(i.label)}</a>
          <div style="font-size:13px;color:#5C6068;margin-top:4px;">You scored <span style="font-family:ui-monospace,Menlo,Consolas,monospace;color:#C43D2B;">${escapeHtml(i.score)}</span></div>
        </td>
        <td style="padding:14px 0 14px 12px;border-top:1px solid #E4E1D8;text-align:right;vertical-align:middle;white-space:nowrap;">
          <a href="${escapeHtml(i.link)}" style="color:#C43D2B;font-size:14px;font-weight:600;text-decoration:none;">Try again &rarr;</a>
        </td>
      </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html><body style="margin:0;background:#FAF9F5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16181D;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5C6068;margin:0 0 16px;">BoardEdge</p>
    <h1 style="font-family:Georgia,serif;font-weight:500;font-size:26px;line-height:1.2;margin:0 0 16px;">${escapeHtml(greeting)} ${one ? "one answer is" : "a few answers are"} ready for another go</h1>
    <p style="font-size:16px;line-height:1.6;margin:0 0 20px;">${escapeHtml(intro)}</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-bottom:1px solid #E4E1D8;margin:0 0 24px;">${rows}
    </table>
    <p style="font-size:14px;line-height:1.6;color:#5C6068;margin:0 0 28px;">Each one is marked against the same official scheme, so you&rsquo;ll see straight away whether the missing points are in.</p>
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
