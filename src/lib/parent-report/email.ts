// src/lib/parent-report/email.ts
//
// The two emails a parent can receive about reports, both to the address
// that confirmed consent:
//   - the invite, sent only when the student presses "Invite my parent", and
//     which does nothing by itself: the parent opts in on the linked page;
//   - the weekly report, only after they have.
// Neither contains answer text, feedback or model answers. Every report
// carries a signed stop link and RFC 8058 one-click headers.

import { escapeHtml, sendEmail, type SendResult } from "@/lib/email/send";
import { getSiteUrl } from "@/lib/site-url";
import { fmtMarks } from "@/lib/practice-sets/results";
import { LEAK_REASON_LABELS } from "@/lib/progress/types";
import type { ParentReport } from "./content";
import { reportLinks } from "./service";

const shell = (title: string, body: string, footer: string) => `<!doctype html>
<html><body style="margin:0;background:#FAF9F5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16181D;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5C6068;margin:0 0 16px;">BoardEdge · For parents</p>
    <h1 style="font-family:Georgia,serif;font-weight:500;font-size:26px;line-height:1.2;margin:0 0 16px;">${title}</h1>
    ${body}
    <p style="font-size:12px;line-height:1.6;color:#8A8D93;margin:28px 0 0;">${footer}</p>
  </div>
</body></html>`;

const p = (html: string) => `<p style="font-size:16px;line-height:1.6;margin:0 0 16px;">${html}</p>`;
const button = (href: string, label: string) =>
  `<p style="margin:8px 0 20px;"><a href="${escapeHtml(href)}" style="display:inline-block;background:#C43D2B;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;padding:12px 20px;border-radius:10px;">${escapeHtml(label)}</a></p>`;

// ─── Invite ──────────────────────────────────────────────────────────────────

export async function sendReportInvite({
  userId,
  to,
  firstName,
}: {
  userId: string;
  to: string;
  firstName: string | null;
}): Promise<SendResult> {
  const links = reportLinks("on", userId, to);
  if (!links) return { ok: false, reason: "site_url_unavailable" };
  const who = firstName ?? "Your child";
  const whose = firstName ? `${firstName}’s` : "your child’s";
  const subject = `Get a weekly summary of ${whose} board-exam practice`;
  const included =
    "how many answers they practised, their marks, marks they won back by reattempting, the kinds of mistakes costing them marks, and their weakest chapter";
  const excluded = "the answers themselves, the examiner’s feedback or model answers";

  const text = [
    "Hello,",
    "",
    `${who} has asked BoardEdge to send you a short weekly summary of their practice. You confirmed parental consent for their account earlier.`,
    "",
    `Each Monday it would cover ${included}. It never includes ${excluded}.`,
    "",
    `Nothing is sent unless you turn it on here: ${links.page}`,
    "",
    "You can stop it at any time from a link in every summary.",
    "",
    "— BoardEdge",
  ].join("\n");

  const html = shell(
    `${escapeHtml(who)} would like you to see their weekly progress`,
    p(`${escapeHtml(who)} has asked BoardEdge to send you a short weekly summary of their practice. You confirmed parental consent for their account earlier.`) +
      p(`Each Monday it would cover ${escapeHtml(included)}. It never includes ${escapeHtml(excluded)}.`) +
      button(links.page, "Turn on weekly summaries") +
      p(`<span style="font-size:14px;color:#5C6068;">Nothing is sent unless you turn it on. You can stop it at any time from a link in every summary.</span>`),
    "You’re receiving this because this address confirmed parental consent for a BoardEdge account, and the student asked us to send it. If you do nothing, you won’t hear from us about reports again.",
  );
  return sendEmail({ to, subject, text, html });
}

// ─── Weekly report ───────────────────────────────────────────────────────────

function trendWord(thisWeek: number, lastWeek: number): string {
  if (thisWeek < lastWeek) return `down from ${lastWeek}`;
  if (thisWeek > lastWeek) return lastWeek === 0 ? "new this week" : `up from ${lastWeek}`;
  return "same as last week";
}

/** Pure: the report's lines, shared by the text and HTML parts. */
export function reportLines(r: ParentReport, firstName: string | null): { heading: string; lines: string[] } {
  const who = firstName ?? "Your child";
  if (r.answers === 0) {
    return {
      heading: `${who} didn’t practise on BoardEdge this week`,
      lines: [
        r.answersLastWeek
          ? `Last week they answered ${r.answersLastWeek} question${r.answersLastWeek === 1 ? "" : "s"}.`
          : "No answers were marked in the last two weeks.",
        ...(r.weakest ? [`The chapter costing them the most marks overall is ${r.weakest.chapter} (${r.weakest.subject}).`] : []),
      ],
    };
  }
  const pct = r.possible ? Math.round((r.scored / r.possible) * 100) : 0;
  const lines = [
    `Answered ${r.answers} question${r.answers === 1 ? "" : "s"} (${r.answersLastWeek} the week before)${r.subjects.length ? ` in ${r.subjects.join(", ")}` : ""}.`,
    `Scored ${fmtMarks(r.scored)} of ${fmtMarks(r.possible)} marks (${pct}%).`,
    r.marksRecovered > 0
      ? `Won back ${fmtMarks(r.marksRecovered)} mark${r.marksRecovered === 1 ? "" : "s"} by rewriting answers that had fallen short.`
      : "Didn’t win back marks on a reattempt this week. Rewriting a weak answer is the quickest gain.",
  ];
  if (r.streakWeeks > 1) lines.push(`That’s ${r.streakWeeks} weeks in a row of winning marks back.`);
  if (r.reasons.length) {
    lines.push(
      `Where marks were lost: ${r.reasons.map((x) => `${LEAK_REASON_LABELS[x.reason].toLowerCase()} ${x.thisWeek}× (${trendWord(x.thisWeek, x.lastWeek)})`).join("; ")}.`,
    );
  }
  if (r.weakest) lines.push(`Weakest chapter right now: ${r.weakest.chapter} (${r.weakest.subject}).`);
  if (r.plan) lines.push(`Weekly plan: ${r.plan.completed} of ${r.plan.total} tasks done.`);
  return { heading: `${who}’s week on BoardEdge`, lines };
}

export async function sendParentReport({
  userId,
  to,
  firstName,
  report,
}: {
  userId: string;
  to: string;
  firstName: string | null;
  report: ParentReport;
}): Promise<SendResult> {
  const stop = reportLinks("off", userId, to);
  const siteUrl = getSiteUrl();
  if (!stop || !siteUrl) return { ok: false, reason: "site_url_unavailable" };

  const { heading, lines } = reportLines(report, firstName);
  const note =
    "These figures come from answers marked against the official ICSE marking schemes. They show practice, not a predicted exam grade.";

  const text = [heading, "", ...lines.map((l) => `- ${l}`), "", note, "", "— BoardEdge", "", `Stop these weekly summaries: ${stop.page}`].join("\n");
  const html = shell(
    escapeHtml(heading),
    `<ul style="padding-left:20px;margin:0 0 20px;">${lines
      .map((l) => `<li style="font-size:16px;line-height:1.6;margin:0 0 8px;">${escapeHtml(l)}</li>`)
      .join("")}</ul>` + p(`<span style="font-size:14px;color:#5C6068;">${escapeHtml(note)}</span>`),
    `You turned on weekly summaries for this student. <a href="${escapeHtml(stop.page)}" style="color:#8A8D93;">Stop weekly summaries</a>`,
  );

  return sendEmail({
    to,
    subject: heading,
    text,
    html,
    headers: {
      "List-Unsubscribe": `<${stop.oneClick}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}
