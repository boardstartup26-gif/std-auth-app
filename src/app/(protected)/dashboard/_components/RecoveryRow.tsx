// The Marks Recovered Streak on the dashboard: a standing row in the same
// hairline grid as Latest result / Quick start / Friends.
//
// The streak counts weeks (Mon–Sun, IST) in which the student won back at
// least one mark on a reattempt — improvement, not logins. Every figure comes
// from buildProgressSnapshot(), so it can't disagree with /progress.
// Server component; receives derived numbers only.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { fmtMarks } from "@/lib/practice-sets/results";
import type { ProgressSnapshot } from "@/lib/progress";
import { buildFixList } from "@/app/(protected)/practice-paper/actions";
import { PendingSubmit } from "@/app/_components/states/PendingSubmit";
import { numericFigures } from "@/lib/ui";

function streakLine(snap: ProgressSnapshot): React.ReactNode {
  const { streak, gain } = snap;
  const weeks = (n: number) => `${n}-week`;

  if (gain.marksRecovered === 0) {
    return "Rewrite an answer that fell short. Every week you win back a mark adds to your streak.";
  }
  if (streak.current > 0 && streak.thisWeekCounted) {
    return (
      <>
        <span className="font-semibold text-foreground">{weeks(streak.current)} streak</span> ·{" "}
        <span className={`${numericFigures} font-semibold text-status-correct`}>+{fmtMarks(streak.thisWeekMarks)}</span> won back this
        week
      </>
    );
  }
  if (streak.current > 0) {
    // Alive but not yet extended: the week runs to Sunday night IST.
    return (
      <>
        <span className="font-semibold text-foreground">{weeks(streak.current)} streak</span> — win back a mark by Sunday to keep it
      </>
    );
  }
  return (
    <>
      Streak paused{streak.best > 1 ? ` (best: ${streak.best} weeks)` : ""} — win back a mark this week to start again
    </>
  );
}

export function RecoveryRow({ snap, rowLabel, textLink }: { snap: ProgressSnapshot; rowLabel: string; textLink: string }) {
  const leak = snap.leakage.byChapter.find((c) => c.chapter !== null && c.lost > 0);
  const live = snap.streak.current;
  const fixSubject = snap.weakest[0]?.subject ?? null;

  return (
    <section
      className="grid items-center gap-x-8 gap-y-3 border-b border-border py-5 sm:grid-cols-[9rem_minmax(0,1fr)_auto_auto]"
      aria-labelledby="marks-recovered"
    >
      <p id="marks-recovered" className={rowLabel}>
        Recovered
      </p>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{streakLine(snap)}</p>
        {leak ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            Biggest leak: {leak.chapter} · {leak.subject} (−{fmtMarks(leak.lost)})
          </p>
        ) : null}
        {/* Fix List for the subject whose weakest chapter is weakest overall
            (share of marks lost), the same ranking /progress uses. */}
        {fixSubject ? (
          <form action={buildFixList} className="mt-2">
            <input type="hidden" name="subject" value={fixSubject} />
            <input type="hidden" name="src" value="dashboard" />
            <PendingSubmit
              pendingLabel="Building your Fix List…"
              className="text-xs font-medium text-accent underline-offset-4 hover:text-accent-hover hover:underline"
            >
              Build a {fixSubject} Fix List from your weakest chapters
            </PendingSubmit>
          </form>
        ) : null}
      </div>
      {/* The big figure is the streak only while one is live. Otherwise it's
          the marks already won back: a large "0" reads as failure, and the
          total is the thing the student has actually earned. */}
      {live > 0 ? (
        <p className="flex items-baseline gap-1.5">
          <span className={`${numericFigures} font-display text-3xl leading-none text-foreground`}>{live}</span>
          <span className="text-xs text-muted-foreground">
            {live === 1 ? "week" : "weeks"}
            <span className="mx-1">·</span>
            <span className={numericFigures}>+{fmtMarks(snap.gain.marksRecovered)}</span> total
          </span>
        </p>
      ) : (
        <p className="flex items-baseline gap-1.5">
          <span className={`${numericFigures} font-display text-3xl leading-none text-foreground`}>
            +{fmtMarks(snap.gain.marksRecovered)}
          </span>
          <span className="text-xs text-muted-foreground">
            {snap.gain.marksRecovered === 1 ? "mark" : "marks"} won back
          </span>
        </p>
      )}
      <Link href="/progress" className={textLink}>
        See your progress
        <ArrowRight size={14} strokeWidth={2} aria-hidden />
      </Link>
    </section>
  );
}
