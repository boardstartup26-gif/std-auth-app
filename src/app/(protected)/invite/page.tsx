// /invite — the referral program's home. The student's personal link with
// one-tap sharing, how far they've got (friends joined, counting, credits
// earned), and the rules in three lines.
//
// Friends appear by first name and progress only — never marks, answers or
// contact details.

import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";
import { numericFigures, sectionLabel } from "@/lib/ui";
import {
  MAX_REWARDED_REFERRALS,
  MAX_WEEKLY_BONUS,
  REFERRAL_QUALIFY_AT,
  REFERRAL_WEEKLY_BONUS,
  WEEKLY_CREDIT_LIMIT,
} from "@/lib/constants";
import { inviteMessage, inviteUrl } from "@/lib/referrals/constants";
import { readInvitedBy, readReferralSummary, type ReferralFriend } from "@/lib/referrals/service";
import { ShareInvite } from "@/app/_components/ShareInvite";

export const dynamic = "force-dynamic";

const rowLabel = "text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";

const LADDER = [1, 3, 5, MAX_REWARDED_REFERRALS];

function friendStatus(f: ReferralFriend): { text: string; tone: string } {
  switch (f.state) {
    case "counted":
      return { text: `Counted · +${REFERRAL_WEEKLY_BONUS}/week each`, tone: "text-status-correct" };
    case "progress":
      return {
        text: `${f.writtenMarked} of ${REFERRAL_QUALIFY_AT} answers marked`,
        tone: "text-foreground",
      };
    case "checking":
      return { text: "Being checked", tone: "text-muted-foreground" };
    default:
      return { text: `Joined · 0 of ${REFERRAL_QUALIFY_AT} answers marked`, tone: "text-muted-foreground" };
  }
}

export default async function InvitePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [summary, invitedBy] = await Promise.all([
    readReferralSummary(user.id),
    readInvitedBy(user.id),
  ]);
  const siteUrl = getSiteUrl();
  const url = summary.code && siteUrl ? inviteUrl(siteUrl, summary.code, { surface: "invite_page" }) : null;
  const weeklyNow = WEEKLY_CREDIT_LIMIT + Math.min(MAX_WEEKLY_BONUS, summary.weeklyBonusEarned);
  const nextRung = LADDER.find((n) => n > summary.qualified) ?? null;

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <p className={`${sectionLabel} font-medium normal-case tracking-normal`}>Invite friends</p>
      <h1 className="mt-1.5 max-w-[22ch] font-display text-3xl leading-tight text-foreground text-balance sm:text-[2.5rem]">
        Every friend who joins gets you both{" "}
        <span className="text-status-correct">+{REFERRAL_WEEKLY_BONUS} credits a week</span>, for good.
      </h1>
      <p className="mt-4 max-w-[var(--measure)] text-sm leading-relaxed text-muted-foreground">
        Send your link to classmates preparing for the ICSE boards. Once a friend has had{" "}
        {REFERRAL_QUALIFY_AT} written answers marked, your weekly allowance and theirs both go up by{" "}
        {REFERRAL_WEEKLY_BONUS} — permanently.
      </p>

      {/* ─── Share ───────────────────────────────────────────────────────── */}
      <section className="mt-9 rounded-lg border border-border bg-card px-6 py-6 sm:px-7" aria-labelledby="your-link">
        <p id="your-link" className={rowLabel}>Your link</p>
        {url ? (
          <>
            <p className={`${numericFigures} mt-2 break-all font-mono text-sm text-foreground`}>
              {url.split("?")[0]}
            </p>
            <div className="mt-5">
              <ShareInvite surface="invite_page" initial={{ url, message: inviteMessage(url) }} />
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Your invite link couldn&rsquo;t be loaded just now. Refresh the page to try again.
          </p>
        )}
      </section>

      {/* ─── Progress ────────────────────────────────────────────────────── */}
      <section className="mt-10 grid gap-x-10 gap-y-6 border-t border-foreground/80 pt-6 sm:grid-cols-3" aria-label="Your referral progress">
        <div>
          <p className={rowLabel}>Friends counted</p>
          <p className={`${numericFigures} mt-1 font-display text-4xl text-foreground`}>{summary.qualified}</p>
        </div>
        <div>
          <p className={rowLabel}>Earned so far</p>
          <p className={`${numericFigures} mt-1 font-display text-4xl text-status-correct`}>
            +{Math.min(MAX_WEEKLY_BONUS, summary.weeklyBonusEarned)}
            <span className="text-base text-muted-foreground">/week</span>
          </p>
        </div>
        <div>
          <p className={rowLabel}>Your weekly credits</p>
          <p className={`${numericFigures} mt-1 font-display text-4xl text-foreground`}>{weeklyNow}</p>
        </div>
      </section>

      <ol className="mt-8 grid grid-cols-4 border-t border-border" aria-label="Milestones">
        {LADDER.map((n) => {
          const reached = summary.qualified >= n;
          return (
            <li key={n} className={`border-r border-border px-3 py-4 last:border-r-0 ${reached ? "bg-status-correct-subtle" : ""}`}>
              <p className={`${numericFigures} flex items-center gap-1.5 font-display text-xl ${reached ? "text-status-correct" : "text-foreground"}`}>
                {reached ? <Check size={16} strokeWidth={2.5} aria-hidden /> : null}
                {n}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                friend{n === 1 ? "" : "s"} · <span className={numericFigures}>+{Math.min(MAX_WEEKLY_BONUS, n * REFERRAL_WEEKLY_BONUS)}</span>/wk
              </p>
            </li>
          );
        })}
      </ol>
      {nextRung ? (
        <p className="mt-3 text-sm text-muted-foreground">
          <span className={`${numericFigures} font-semibold text-foreground`}>{nextRung - summary.qualified}</span>{" "}
          more friend{nextRung - summary.qualified === 1 ? "" : "s"} to reach {nextRung}.
        </p>
      ) : (
        <p className="mt-3 text-sm text-status-correct">
          You&rsquo;ve earned the full +{MAX_WEEKLY_BONUS} a week. Thank you for spreading the word.
        </p>
      )}

      {/* ─── Friends ─────────────────────────────────────────────────────── */}
      <section className="mt-12" aria-labelledby="friends">
        <h2 id="friends" className="border-b border-foreground/80 pb-3 font-display text-xl text-foreground">
          Friends who joined
        </h2>
        {summary.friends.length ? (
          <ul className="divide-y divide-border">
            {summary.friends.map((f, i) => {
              const s = friendStatus(f);
              return (
                <li key={`${f.joinedAt}-${i}`} className="flex items-baseline justify-between gap-4 py-3.5">
                  <span className="font-display text-base text-foreground">{f.firstName}</span>
                  <span className={`${numericFigures} text-right text-xs ${s.tone}`}>{s.text}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="border-b border-border py-6 text-sm text-muted-foreground">
            No one yet. The first friend who signs up with your link appears here.
          </p>
        )}
      </section>

      {invitedBy ? (
        <p className="mt-8 border-l-2 border-rule pl-3 text-sm text-muted-foreground">
          {invitedBy.firstName ?? "A friend"} invited you.{" "}
          {invitedBy.status === "qualified"
            ? `You both have +${REFERRAL_WEEKLY_BONUS} credits a week for it.`
            : invitedBy.status === "pending"
              ? `${Math.max(0, REFERRAL_QUALIFY_AT - invitedBy.writtenMarked)} more marked written answer${REFERRAL_QUALIFY_AT - invitedBy.writtenMarked === 1 ? "" : "s"} and you both get +${REFERRAL_WEEKLY_BONUS} a week.`
              : null}
        </p>
      ) : null}

      {/* ─── Rules ───────────────────────────────────────────────────────── */}
      <section className="mt-12 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground" aria-label="Rules">
        <ul className="space-y-1.5">
          <li>A friend counts once they&rsquo;ve signed up with your link and had {REFERRAL_QUALIFY_AT} written answers marked.</li>
          <li>
            Bonuses stack up to +{MAX_WEEKLY_BONUS} credits a week, for up to {MAX_REWARDED_REFERRALS} friends. Credits
            have no cash value and can&rsquo;t be transferred.
          </li>
          <li>Inviting yourself or making extra accounts doesn&rsquo;t count, and cancels the bonus.</li>
        </ul>
      </section>
    </div>
  );
}
