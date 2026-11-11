// src/app/(protected)/progress/page.tsx
//
// Progress overview: headline figures, subject-wise performance, the Marks
// Recovered Streak, and the way into Fix List / Leakage Map / Reattempt Gain.
//
// Server-rendered; the components receive derived numbers only. Answer text,
// examiner feedback and model answers are never read here, so they can't
// reach the browser from this page.

import Link from "next/link";
import { ArrowRight, ChartPie, ClipboardList, FileText, Flame, Layers, Target, TrendingUp } from "lucide-react";
import { buildProgressSnapshot, LEAK_REASON_LABELS, topReasons } from "@/lib/progress";
import type { ProgressSnapshot } from "@/lib/progress";
import { fmtMarks } from "@/lib/practice-sets/results";
import { numericFigures } from "@/lib/ui";
import { dashCard, dashHeading, dashLink, iconChip, tileInteractive } from "@/app/(protected)/dashboard/_lib/styles";
import { BookStackSketch } from "@/app/(protected)/dashboard/_components/Illustrations";
import { ProgressFrame } from "./_components/ProgressFrame";
import { NothingMarkedYet, ProgressLoadFailed } from "./_components/ProgressStates";
import { StatCard } from "./_components/StatCard";
import { countMarkedPapers, loadProgress, subjectStats, type SubjectStat } from "./_lib/load";

export const dynamic = "force-dynamic";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <ProgressFrame
      eyebrow="Your progress"
      title="Your preparation at a glance."
      subtitle="Track your performance, spot gaps, and see how you’re improving over time."
      art={<BookStackSketch className="w-full" />}
    >
      {children}
    </ProgressFrame>
  );
}

// ─── Subject performance ─────────────────────────────────────────────────────

function SubjectPerformance({ stats }: { stats: SubjectStat[] }) {
  return (
    <section className={`${dashCard} p-5 sm:p-6`} aria-labelledby="subject-performance">
      <h2 id="subject-performance" className={dashHeading}>
        Subject performance
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">Marks scored on your latest attempt at each question.</p>
      <ul className="mt-5 space-y-3.5">
        {stats.map((s) => (
          <li key={s.subject} className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)_3rem] items-center gap-x-4 sm:grid-cols-[10rem_minmax(0,1fr)_3rem]">
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-medium text-foreground">{s.subject}</p>
              <p className={`${numericFigures} text-[11px] text-muted-foreground`}>
                {fmtMarks(s.scored)}/{fmtMarks(s.possible)} · {plural(s.questions, "question", "questions")}
              </p>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-rule"
              role="img"
              aria-label={`${s.subject}: ${s.percent}% of marks scored`}
            >
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(s.percent, 2)}%` }} />
            </div>
            <p className={`${numericFigures} text-right text-[13.5px] font-semibold text-foreground`}>{s.percent}%</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── Marks Recovered Streak ──────────────────────────────────────────────────
// Weeks (Mon–Sun, IST) in which the student won back at least one mark on a
// reattempt — improvement, not logins.

function StreakCard({ snap }: { snap: ProgressSnapshot }) {
  const { streak, gain } = snap;
  let line: React.ReactNode;
  if (gain.marksRecovered === 0) {
    line = "Rewrite an answer that fell short. Every week you win back a mark adds to your streak.";
  } else if (streak.current > 0 && streak.thisWeekCounted) {
    line = (
      <>
        <span className={`${numericFigures} font-semibold text-status-correct`}>+{fmtMarks(streak.thisWeekMarks)}</span> won back
        this week — streak extended.
      </>
    );
  } else if (streak.current > 0) {
    line = "Win back a mark by Sunday night to keep it going.";
  } else {
    line = `Paused${streak.best > 1 ? ` (best: ${streak.best} weeks)` : ""} — win back a mark this week to start again.`;
  }

  return (
    <section className={`${dashCard} flex flex-col p-5 sm:p-6`} aria-labelledby="streak">
      <div className="flex items-center gap-3">
        <span className={iconChip}>
          <Flame size={18} strokeWidth={1.75} aria-hidden />
        </span>
        <h2 id="streak" className={dashHeading}>
          Marks recovered streak
        </h2>
      </div>
      <p className="mt-5 flex items-baseline gap-2">
        <span className={`${numericFigures} font-display text-[2.6rem] font-semibold leading-none text-accent`}>
          {streak.current}
        </span>
        <span className="text-sm text-muted-foreground">{streak.current === 1 ? "week" : "weeks"} in a row</span>
      </p>
      <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{line}</p>
      <p className={`${numericFigures} mt-auto border-t border-border pt-3 text-xs text-muted-foreground`}>
        Best streak <span className="font-semibold text-foreground">{streak.best}</span> · total won back{" "}
        <span className="font-semibold text-foreground">+{fmtMarks(gain.marksRecovered)}</span>
      </p>
    </section>
  );
}

// ─── Where next ──────────────────────────────────────────────────────────────

function SectionCards({ snap }: { snap: ProgressSnapshot }) {
  const top = topReasons(snap.leakage.reasons, 1)[0];
  const cards = [
    {
      href: "/progress/fix-list",
      icon: ClipboardList,
      title: "Fix List",
      fact: snap.weakest.length
        ? `${plural(snap.weakest.length, "weak chapter", "weak chapters")} to target, starting with ${snap.weakest[0].chapter}`
        : "Builds once a chapter has two marked questions with marks lost",
    },
    {
      href: "/progress/leakage",
      icon: ChartPie,
      title: "Leakage Map",
      fact: snap.leakage.lost > 0
        ? `${fmtMarks(snap.leakage.lost)} marks lost${top ? ` · most often: ${LEAK_REASON_LABELS[top.reason].toLowerCase()}` : ""}`
        : "Nothing lost on your latest attempts",
    },
    {
      href: "/progress/reattempt-gain",
      icon: TrendingUp,
      title: "Reattempt Gain",
      fact: snap.gain.reattempted
        ? `+${fmtMarks(snap.gain.marksRecovered)} marks won back across ${plural(snap.gain.reattempted, "question", "questions")}`
        : "Rewrite a written answer to see what you win back",
    },
  ];
  return (
    <ul className="mt-4 grid gap-4 sm:grid-cols-3">
      {cards.map(({ href, icon: Icon, title, fact }) => (
        <li key={href}>
          <Link href={href} className={`${dashCard} ${tileInteractive} group flex h-full flex-col p-5`}>
            <span className={iconChip}>
              <Icon size={18} strokeWidth={1.75} aria-hidden />
            </span>
            <span className="mt-3 font-display text-lg font-semibold text-foreground">{title}</span>
            <span className={`${numericFigures} mt-1 text-[13px] leading-snug text-muted-foreground`}>{fact}</span>
            <span className={`${dashLink} mt-auto pt-3`}>
              Open <ArrowRight size={13} strokeWidth={2} aria-hidden />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function ProgressPage() {
  const { userId, read } = await loadProgress("/progress");
  if (!read.ok) {
    return (
      <Frame>
        <ProgressLoadFailed />
      </Frame>
    );
  }
  if (!read.attempts.length) {
    return (
      <Frame>
        <NothingMarkedYet what="this page shows your average score, how each subject is going, and how many marks you win back by trying again." />
      </Frame>
    );
  }

  const snap = buildProgressSnapshot(read.attempts);
  const papers = await countMarkedPapers(userId);
  const { leakage, gain } = snap;
  const avg = leakage.possible ? Math.round(((leakage.possible - leakage.lost) / leakage.possible) * 100) : 0;

  return (
    <Frame>
      <div className={`grid grid-cols-2 gap-3 ${papers === null ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}>
        <StatCard icon={Target} value={`${avg}%`} label="Avg. score" note="latest attempt per question" />
        <StatCard icon={FileText} value={leakage.questions} label="Questions" note="marked so far" />
        {papers !== null ? <StatCard icon={Layers} value={papers} label="Papers" note="practice papers marked" /> : null}
        <StatCard
          icon={TrendingUp}
          value={gain.reattempted ? `+${fmtMarks(gain.marksRecovered)}` : "—"}
          label="Reattempt gain"
          note={gain.reattempted ? "marks won back" : "no rewrites yet"}
        />
      </div>

      <div className="mt-8 grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <SubjectPerformance stats={subjectStats(read.attempts)} />
        <StreakCard snap={snap} />
      </div>

      <h2 className={`${dashHeading} mt-10`}>Where to next</h2>
      <SectionCards snap={snap} />
    </Frame>
  );
}
