// src/lib/referrals/email.ts
//
// "Your friend counted" — to the inviter's own address, never the friend's or
// a parent's. Treated as a reminder-class email: skipped when the student has
// turned reminders off, and it carries the same one-click unsubscribe. The
// in-app notification goes out regardless.

import { escapeHtml, sendEmail } from "@/lib/email/send";
import { unsubscribeLinks } from "@/lib/email/reminder-preferences";
import { readEmailPrefs } from "@/lib/notifications/reattempt-email";
import { getSiteUrl } from "@/lib/site-url";
import { REFERRAL_WEEKLY_BONUS } from "@/lib/constants";

export async function sendReferralQualifiedEmail({
  userId,
  friendName,
}: {
  userId: string;
  friendName: string;
}): Promise<void> {
  const prefs = await readEmailPrefs(userId);
  if (!prefs.email || !prefs.remindersOn) return;

  const siteUrl = getSiteUrl();
  const unsubscribe = unsubscribeLinks(userId);
  if (!siteUrl || !unsubscribe) return;

  const name = (prefs.firstName ?? "").trim().split(/\s+/)[0]?.slice(0, 40) ?? "";
  const greeting = name ? `Hi ${name},` : "Hi,";
  const friend = friendName.slice(0, 40);
  const inviteLink = `${siteUrl}/invite`;
  const line = `${friend} has had their first answers marked on BoardEdge, so you both now get ${REFERRAL_WEEKLY_BONUS} extra credits every week — for good.`;

  const text = [
    greeting,
    "",
    line,
    "",
    `Every friend who joins with your link adds another ${REFERRAL_WEEKLY_BONUS} a week: ${inviteLink}`,
    "",
    "— BoardEdge",
    "",
    `Stop these emails: ${unsubscribe.page}`,
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;background:#FAF9F5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16181D;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5C6068;margin:0 0 16px;">BoardEdge</p>
    <h1 style="font-family:Georgia,serif;font-weight:500;font-size:26px;line-height:1.2;margin:0 0 16px;">+${REFERRAL_WEEKLY_BONUS} credits a week, thanks to ${escapeHtml(friend)}</h1>
    <p style="font-size:16px;line-height:1.6;margin:0 0 20px;">${escapeHtml(greeting)} ${escapeHtml(line)}</p>
    <p style="margin:0 0 24px;"><a href="${escapeHtml(inviteLink)}" style="display:inline-block;background:#C43D2B;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px;">Invite another friend</a></p>
    <p style="font-size:12px;line-height:1.6;color:#8A8D93;margin:0;">You&rsquo;re getting this because a friend joined BoardEdge with your link. <a href="${escapeHtml(unsubscribe.page)}" style="color:#8A8D93;">Stop these emails</a></p>
  </div>
</body></html>`;

  const result = await sendEmail({
    to: prefs.email,
    subject: `${friend} joined — you now get +${REFERRAL_WEEKLY_BONUS} credits a week`,
    text,
    html,
    headers: {
      "List-Unsubscribe": `<${unsubscribe.oneClick}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
  if (!result.ok) console.warn("[BoardEdge] referral email not sent:", result.reason);
}
