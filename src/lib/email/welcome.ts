// src/lib/email/welcome.ts
//
// The one-time welcome email, sent to the student's own address — never a
// parent's — the moment their account is created, whichever path created it:
// a password signup or a first-ever Google sign-in.
//
// Never sent on a login. Callers are responsible for that distinction, since
// each auth path already has to make it for its own reasons:
//   - src/app/(auth)/actions.ts's signup() only for a genuinely new user
//     (isRealNewUser — the enumeration-safe path for an email that already
//     has an account gets no email of any kind).
//   - src/app/auth/callback/route.ts only when isNewAccount is true.

import { escapeHtml, sendEmail, type SendResult } from "./send";
import { getSiteUrl } from "@/lib/site-url";

export async function sendWelcomeEmail({
  to,
  firstName,
}: {
  to: string;
  firstName: string | null;
}): Promise<SendResult> {
  const siteUrl = getSiteUrl();
  if (!siteUrl) {
    // Same posture as the consent email: never guess a domain from the
    // request. A welcome email is not compliance-critical, so this fails
    // quietly rather than raising — there's no student waiting on it the way
    // a parent is waiting on a confirmation link.
    console.error("[BoardEdge] NEXT_PUBLIC_SITE_URL is not set; skipping welcome email.");
    return { ok: false, reason: "site_url_unavailable" };
  }

  const name = (firstName ?? "").trim().slice(0, 40);
  const greeting = name ? `Hi ${name},` : "Hi there,";
  const evaluateLink = `${siteUrl}/evaluate`;

  const text = [
    greeting,
    "",
    "Welcome to BoardEdge — you're set up and ready to practise.",
    "",
    "Pick a subject and a past-paper question, write your answer, and we'll grade it against the official ICSE marking scheme, point by point, the way a real examiner would.",
    "",
    "One thing worth knowing up front: your first 2 evaluations are free to try, no extra step needed. After that, we'll need your parent or guardian to confirm consent by email before grading continues — that's a legal requirement for students under 18, and it only takes them a minute.",
    "",
    `Start practising: ${evaluateLink}`,
    "",
    "Questions? Just reply to this email.",
    "",
    "— BoardEdge",
  ].join("\n");

  const safeGreeting = escapeHtml(greeting);
  const safeLink = escapeHtml(evaluateLink);
  const html = `<!doctype html>
<html><body style="margin:0;background:#FAF9F5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16181D;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5C6068;margin:0 0 16px;">BoardEdge</p>
    <h1 style="font-family:Georgia,serif;font-weight:500;font-size:26px;line-height:1.2;margin:0 0 20px;">${safeGreeting} welcome aboard</h1>
    <p style="font-size:16px;line-height:1.6;margin:0 0 14px;">You're set up and ready to practise.</p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 14px;">Pick a subject and a past-paper question, write your answer, and we&rsquo;ll grade it against the official ICSE marking scheme, point by point, the way a real examiner would.</p>
    <p style="font-size:15px;line-height:1.6;color:#5C6068;margin:0 0 24px;">One thing worth knowing up front: your first 2 evaluations are free to try, no extra step needed. After that, we&rsquo;ll need your parent or guardian to confirm consent by email before grading continues &mdash; that&rsquo;s a legal requirement for students under 18, and it only takes them a minute.</p>
    <p style="margin:0 0 24px;"><a href="${safeLink}" style="display:inline-block;background:#C43D2B;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px;">Start practising</a></p>
    <p style="font-size:13px;line-height:1.6;color:#5C6068;margin:0;">Questions? Just reply to this email.</p>
  </div>
</body></html>`;

  return sendEmail({
    to,
    subject: "Welcome to BoardEdge",
    text,
    html,
  });
}
