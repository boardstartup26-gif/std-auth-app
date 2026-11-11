// The /invite page's presentation: heading, link card, how it works,
// referral status, friends, rules. Receives the student's own data from
// page.tsx; no reads happen here. Server component (InviteLinkCard is the
// one client island).
//
// Friends appear by first name and progress only — never marks, answers or
// contact details.

import { ArrowRight, Check, CircleCheck, Gift, Star, UserPlus, Users } from "lucide-react";
import { numericFigures } from "@/lib/ui";
import {
  MAX_REWARDED_REFERRALS,
  MAX_WEEKLY_BONUS,
  REFERRAL_QUALIFY_AT,
  REFERRAL_WEEKLY_BONUS,
  WEEKLY_CREDIT_LIMIT,
} from "@/lib/constants";
import { inviteMessage } from "@/lib/referrals/constants";
import type { ReferralFriend, ReferralSummary } from "@/lib/referrals/service";
import { ReloadableError } from "@/app/_components/states/ErrorState";
import { dashCard, dashEyebrow, dashHeading, iconChip } from "@/app/(protected)/dashboard/_lib/styles";
import { HallSketch } from "@/app/(protected)/dashboard/_components/Illustrations";
import { InviteLinkCard } from "./InviteLinkCard";

const LADDER = [1, 3, 5, MAX_REWARDED_REFERRALS];

function friendStatus(f: ReferralFriend): { text: string; pill: string } {
  switch (f.state) {
    case "counted":
      return { text: `Counted · +${REFERRAL_WEEKLY_BONUS}/week each`, pill: "bg-awarded-subtle text-status-correct" };
    case "progress":
      return { text: `${f.writtenMarked} of ${REFERRAL_QUALIFY_AT} answers marked`, pill: "bg-accent-subtle text-accent" };
    case "checking":
      return { text: "Being checked", pill: "bg-chrome-subtle text-muted-foreground" };
    default:
      return { text: `Joined · 0 of ${REFERRAL_QUALIFY_AT} answers marked`, pill: "bg-chrome-subtle text-muted-foreground" };
  }
}

function joinedLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
}

// ─── How it works ────────────────────────────────────────────────────────────

const STEPS = [
  { title: "Share your link", body: "Send it to classmates preparing for the ICSE boards." },
  { title: "They sign up", body: `They create an account with your link and get ${REFERRAL_QUALIFY_AT} written answers marked.` },
  { title: "You both get credits", body: `+${REFERRAL_WEEKLY_BONUS} credits a week each, added automatically, for good.` },
];

function HowItWorks() {
  return (
    <section className="mt-10" aria-labelledby="how-it-works">
      <h2 id="how-it-works" className={dashHeading}>
        How it works
      </h2>
      <ol className="mt-5 grid gap-6 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-start sm:gap-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="contents">
            <div className="flex gap-3.5 sm:flex-col sm:items-center sm:text-center">
              <span
                className={`${numericFigures} grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-subtle font-display text-lg font-semibold text-accent`}
                aria-hidden
              >
                {i + 1}
              </span>
              <div>
                <p className="font-display text-[1.05rem] font-semibold text-foreground">
                  <span className="sr-only">Step {i + 1}: </span>
                  {s.title}
                </p>
                <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground sm:mx-auto sm:max-w-[13rem]">{s.body}</p>
              </div>
            </div>
            {i < STEPS.length - 1 ? (
              <ArrowRight size={18} aria-hidden className="mt-2 hidden text-accent/70 sm:block" />
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

// ─── View ────────────────────────────────────────────────────────────────────

export interface InvitedBy {
  firstName: string | null;
  status: string;
  writtenMarked: number;
}

export function InviteView({
  summary,
  invitedBy,
  url,
}: {
  summary: ReferralSummary;
  invitedBy: InvitedBy | null;
  /** Full invite URL with attribution params, or null when it couldn't be built. */
  url: string | null;
}) {
  const bonus = Math.min(MAX_WEEKLY_BONUS, summary.weeklyBonusEarned);
  const weeklyNow = WEEKLY_CREDIT_LIMIT + bonus;
  const nextRung = LADDER.find((n) => n > summary.qualified) ?? null;

  return (
    <div className="mx-auto min-h-screen max-w-4xl px-4 py-8 font-body sm:px-6 sm:py-10">
      {/* ─── Heading ──────────────────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-6">
        <div className="min-w-0 max-w-xl">
          <p className={dashEyebrow}>Invite &amp; earn</p>
          <h1 className="mt-2.5 font-display text-[2rem] font-semibold leading-[1.08] tracking-[-0.02em] text-foreground sm:text-[2.6rem]">
            Study is better together.
          </h1>
          <p className="mt-2.5 font-display text-[1.05rem] italic text-foreground/75">
            Invite your friends and earn credits, together.
          </p>
        </div>
        <HallSketch className="-mt-2 hidden w-48 shrink-0 text-accent/55 sm:block lg:w-56" />
      </header>

      {/* ─── Your invite link ─────────────────────────────────────────── */}
      <section className={`${dashCard} mt-7 p-5 sm:p-6`} aria-labelledby="your-link">
        <div className="flex items-start gap-3.5">
          <span className={iconChip}>
            <Gift size={18} strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="your-link" className={dashHeading}>
              Your invite link
            </h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Share this link with your classmates and friends. You both get +{REFERRAL_WEEKLY_BONUS} credits a week once
              they&rsquo;ve had {REFERRAL_QUALIFY_AT} written answers marked.
            </p>
          </div>
        </div>
        <div className="mt-5">
          {url ? (
            <InviteLinkCard url={url} message={inviteMessage(url)} />
          ) : (
            <ReloadableError
              title="We couldn’t load your invite link"
              message="Nothing is lost — your link just didn’t load this time. Try again in a moment."
            />
          )}
        </div>
      </section>

      <HowItWorks />

      {/* ─── Referral status ──────────────────────────────────────────── */}
      <section className="mt-10" aria-labelledby="referral-status">
        <h2 id="referral-status" className={dashHeading}>
          Your referral status
        </h2>
        {summary.loadFailed ? (
          <ReloadableError
            className="mt-4"
            title="We couldn’t load your referrals"
            message="Your friends and credits are safe — they just didn’t load this time. Try again to see them."
          />
        ) : (
          <>
            {/* Three zeros say nothing to a student who hasn't invited anyone
                yet: the cards appear with the first friend. */}
            {summary.friends.length ? (
              <div className="mt-4 grid grid-cols-3 gap-3">
                {[
                  { icon: Users, value: summary.friends.length, label: "Friends joined", note: "signed up with your link" },
                  { icon: CircleCheck, value: summary.qualified, label: "Friends counted", note: `${REFERRAL_QUALIFY_AT} answers marked` },
                  { icon: Star, value: `+${bonus}`, label: "Credits a week", note: `earned · you get ${weeklyNow}/week` },
                ].map(({ icon: Icon, value, label, note }) => (
                  <div key={label} className={`${dashCard} flex flex-col items-center px-2 py-4 text-center sm:py-5`}>
                    <Icon size={22} strokeWidth={1.6} aria-hidden className="text-accent" />
                    <p className={`${numericFigures} mt-2 font-display text-[1.9rem] font-semibold leading-none text-accent sm:text-[2.2rem]`}>
                      {value}
                    </p>
                    <p className="mt-2 text-[12.5px] font-medium text-foreground">{label}</p>
                    <p className="mt-0.5 hidden text-[11px] leading-tight text-muted-foreground sm:block">{note}</p>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Milestones: the same ladder as before, as a slim track. */}
            <div className={`${dashCard} ${summary.friends.length ? "mt-3" : "mt-4"} px-4 py-3.5 sm:px-5`}>
              <ol className="grid grid-cols-4 gap-2" aria-label="Milestones">
                {LADDER.map((n) => {
                  const reached = summary.qualified >= n;
                  return (
                    <li key={n} className="min-w-0">
                      <div className={`h-1.5 rounded-full ${reached ? "bg-status-correct" : "bg-rule"}`} aria-hidden />
                      <p className={`${numericFigures} mt-2 flex items-center gap-1 text-[12.5px] font-semibold ${reached ? "text-status-correct" : "text-foreground"}`}>
                        {reached ? <Check size={13} strokeWidth={2.5} aria-hidden /> : null}
                        {n} friend{n === 1 ? "" : "s"}
                        <span className="sr-only">{reached ? " (reached)" : ""}</span>
                      </p>
                      <p className={`${numericFigures} text-[11px] text-muted-foreground`}>
                        +{Math.min(MAX_WEEKLY_BONUS, n * REFERRAL_WEEKLY_BONUS)}/week
                      </p>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-3 border-t border-border pt-2.5 text-[12.5px] text-muted-foreground">
                {summary.friends.length === 0 ? (
                  <>
                    Your first counted friend adds <span className="font-semibold text-foreground">+{REFERRAL_WEEKLY_BONUS} credits a week</span>{" "}
                    for both of you — on top of your {WEEKLY_CREDIT_LIMIT}.
                  </>
                ) : nextRung ? (
                  <>
                    <span className={`${numericFigures} font-semibold text-foreground`}>{nextRung - summary.qualified}</span> more
                    friend{nextRung - summary.qualified === 1 ? "" : "s"} counted to reach {nextRung}.
                  </>
                ) : (
                  <span className="text-status-correct">
                    You&rsquo;ve earned the full +{MAX_WEEKLY_BONUS} a week. Thank you for spreading the word.
                  </span>
                )}
              </p>
            </div>
          </>
        )}
      </section>

      {/* ─── Friends who joined ───────────────────────────────────────── */}
      {!summary.loadFailed ? (
        <section className="mt-10" aria-labelledby="friends">
          <h2 id="friends" className={dashHeading}>
            Friends who joined
          </h2>
          {summary.friends.length ? (
            <ul className={`${dashCard} mt-4 divide-y divide-border`}>
              {summary.friends.map((f, i) => {
                const s = friendStatus(f);
                return (
                  <li key={`${f.joinedAt}-${i}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-3 sm:px-5">
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-foreground">{f.firstName}</p>
                      <p className={`${numericFigures} text-[11.5px] text-muted-foreground`}>Joined {joinedLabel(f.joinedAt)}</p>
                    </div>
                    <span className={`${numericFigures} rounded-full px-2.5 py-1 text-[11.5px] font-medium ${s.pill}`}>{s.text}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className={`${dashCard} mt-4 flex items-center gap-3.5 px-5 py-5`}>
              <span className={iconChip}>
                <UserPlus size={18} strokeWidth={1.75} aria-hidden />
              </span>
              <p className="text-[13px] text-muted-foreground">
                No one yet. The first friend who signs up with your link appears here, with how close they are to counting.
              </p>
            </div>
          )}
        </section>
      ) : null}

      {invitedBy ? (
        <p className="mt-6 border-l-2 border-accent/40 pl-3 text-[13px] text-muted-foreground">
          {invitedBy.firstName ?? "A friend"} invited you.{" "}
          {invitedBy.status === "qualified"
            ? `You both have +${REFERRAL_WEEKLY_BONUS} credits a week for it.`
            : invitedBy.status === "pending"
              ? `${Math.max(0, REFERRAL_QUALIFY_AT - invitedBy.writtenMarked)} more marked written answer${REFERRAL_QUALIFY_AT - invitedBy.writtenMarked === 1 ? "" : "s"} and you both get +${REFERRAL_WEEKLY_BONUS} a week.`
              : null}
        </p>
      ) : null}

      {/* ─── Rules ────────────────────────────────────────────────────── */}
      <section className="mt-10 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground" aria-label="Rules">
        <ul className="space-y-1.5">
          <li>A friend counts once they&rsquo;ve signed up with your link and had {REFERRAL_QUALIFY_AT} written answers marked.</li>
          <li>
            Bonuses stack up to +{MAX_WEEKLY_BONUS} credits a week, for up to {MAX_REWARDED_REFERRALS} friends. Credits have
            no cash value and can&rsquo;t be transferred.
          </li>
          <li>Inviting yourself or making extra accounts doesn&rsquo;t count, and cancels the bonus.</li>
        </ul>
      </section>
    </div>
  );
}
