// The returning student's progress at a glance: the Marks Recovered Streak,
// the latest marked paper, where marks are leaking, and a one-press Fix List.
//
// The streak counts weeks (Mon–Sun, IST) in which the student won back at
// least one mark on a reattempt — improvement, not logins. Every figure comes
// from buildProgressSnapshot(), so it can't disagree with /progress.
// Server component; receives derived numbers only. Rendered only when there
// is at least one marked answer, so no figure here is an empty "0".

import Link from "next/link";
import { ArrowRight, Flame } from "lucide-react";
import { fmtMarks } from "@/lib/practice-sets/results";
import type { ProgressSnapshot } from "@/lib/progress";
import type { SetSummary } from "@/lib/practice-sets/read";
import { buildFixList } from "@/app/(protected)/practice-paper/actions";
import { PendingSubmit } from "@/app/_components/states/PendingSubmit";
import { numericFigures } from "@/lib/ui";
import { dashButton, dashCard, dashHeading, dashLink } from "../_lib/styles";

function streakLine(snap: ProgressSnapshot): React.ReactNode {
  const { streak, gain } = snap;
  if (gain.marksRecovered === 0) {
    return "Rewrite an answer that fell short. Every week you win back a mark adds to your streak.";
  }
  if (streak.current > 0 && streak.thisWeekCounted) {
    return (
      <>
        <span className="font-semibold text-foreground">{streak.current}-week streak</span> ·{" "}
        <span className={`${numericFigures} font-semibold text-status-correct`}>+{fmtMarks(streak.thisWeekMarks)}</span> won
        back this week
      </>
    );
  }
  if (streak.current > 0) {
    // Alive but not yet extended: the week runs to Sunday night IST.
    return (
      <>
        <span className="font-semibold text-foreground">{streak.current}-week streak</span> — win back a mark by Sunday to keep it
      </>
    );
  }
  return <>Streak paused{streak.best > 1 ? ` (best: ${streak.best} weeks)` : ""} — win back a mark this week to start again</>;
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-3 text-center">
      <p className={`${numericFigures} font-display text-[1.6rem] font-semibold leading-none text-accent`}>{value}</p>
      <p className="mt-1.5 text-[11.5px] leading-tight text-muted-foreground">{label}</p>
    </div>
  );
}

export function ProgressSummary({ snap, latestMarked }: { snap: ProgressSnapshot; latestMarked: SetSummary | null }) {
  const live = snap.streak.current;
  const leak = snap.leakage.byChapter.find((c) => c.chapter !== null && c.lost > 0);
  const fixSubject = snap.weakest[0]?.subject ?? null;
  const latest = latestMarked
    ? { score: latestMarked.score ?? 0, outOf: latestMarked.markedTotal ?? latestMarked.totalMarks }
    : null;

  return (
    <section className={`${dashCard} flex flex-col p-5 sm:p-6`} aria-labelledby="progress-summary">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="progress-summary" className={dashHeading}>
          Your progress
        </h2>
        <Link href="/progress" className={dashLink}>
          See all <ArrowRight size={13} strokeWidth={2} aria-hidden />
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {/* The big figure is the streak only while one is live. Otherwise it's
            the marks already won back: a large "0 weeks" reads as failure. */}
        {live > 0 ? (
          <Stat
            value={
              <span className="inline-flex items-center gap-1">
                <Flame size={18} strokeWidth={1.75} aria-hidden />
                {live}
              </span>
            }
            label={`${live === 1 ? "week" : "weeks"} recovering marks`}
          />
        ) : (
          <Stat value={`+${fmtMarks(snap.gain.marksRecovered)}`} label="marks won back" />
        )}
        {latest ? (
          <Stat value={`${fmtMarks(latest.score)}/${fmtMarks(latest.outOf)}`} label={`latest ${latestMarked!.subject} paper`} />
        ) : (
          <Stat value={snap.attempts} label={snap.attempts === 1 ? "answer marked" : "answers marked"} />
        )}
      </div>

      <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">{streakLine(snap)}</p>

      {leak ? (
        <p className="mt-2 text-[13px] text-muted-foreground">
          Biggest leak:{" "}
          <Link href="/progress#leakage-map" className="font-medium text-foreground underline-offset-4 hover:underline">
            {leak.chapter}
          </Link>{" "}
          · {leak.subject}{" "}
          <span className={`${numericFigures} font-semibold text-accent`}>(−{fmtMarks(leak.lost)})</span>
        </p>
      ) : null}

      {/* Fix List for the subject whose weakest chapter is weakest overall
          (share of marks lost), the same ranking /progress uses. */}
      {fixSubject ? (
        <form action={buildFixList} className="mt-auto pt-5">
          <input type="hidden" name="subject" value={fixSubject} />
          <input type="hidden" name="src" value="dashboard" />
          <PendingSubmit pendingLabel="Building your Fix List…" className={dashButton}>
            Build a {fixSubject} Fix List <ArrowRight size={14} strokeWidth={2} aria-hidden />
          </PendingSubmit>
        </form>
      ) : null}
    </section>
  );
}
