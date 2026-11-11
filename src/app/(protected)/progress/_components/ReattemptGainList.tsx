// Reattempt Gain views. Server components — derived figures only.
//
// Written questions only (lib/progress/gain.ts explains why MCQ retries don't
// count). Gain per question = best later mark − first mark, floored at 0; the
// weekly chart is built from the same recovery events, so its bars always sum
// to the headline total.

import Link from "next/link";
import { ArrowRight, Repeat } from "lucide-react";
import { fmtMarks } from "@/lib/practice-sets/results";
import { questionLabel, reattemptHref } from "@/lib/notifications/reattempt-copy";
import { weekStartIST, type ProgressAttempt, type ReattemptGain } from "@/lib/progress";
import { latestPerQuestion } from "@/lib/progress";
import { EmptyState } from "@/app/_components/states/EmptyState";
import { numericFigures } from "@/lib/ui";
import { dashCard, dashHeading } from "@/app/(protected)/dashboard/_lib/styles";

const MAX_ROWS = 10;
const WEEKS = 8;
const DAY_MS = 86_400_000;

const tryAgain =
  "inline-flex items-center gap-1 text-[12.5px] font-medium text-accent underline-offset-4 hover:text-accent-hover hover:underline";

// ─── Marks won back, week by week ────────────────────────────────────────────

export function WeeklyRecovery({ gain, now }: { gain: ReattemptGain; now: number }) {
  const thisWeek = weekStartIST(now);
  const weeks = Array.from({ length: WEEKS }, (_, i) =>
    new Date(Date.parse(`${thisWeek}T00:00:00Z`) - (WEEKS - 1 - i) * 7 * DAY_MS).toISOString().slice(0, 10),
  );
  const byWeek = new Map<string, number>();
  for (const e of gain.recoveries) {
    const w = weekStartIST(e.at);
    byWeek.set(w, (byWeek.get(w) ?? 0) + e.marks);
  }
  const values = weeks.map((w) => byWeek.get(w) ?? 0);
  const max = Math.max(...values);
  const earlier = gain.recoveries.filter((e) => weekStartIST(e.at) < weeks[0]).reduce((s, e) => s + e.marks, 0);
  if (max === 0) return null;

  return (
    <section className={`${dashCard} p-5 sm:p-6`} aria-labelledby="weekly-recovery">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="weekly-recovery" className={dashHeading}>
          Marks won back, week by week
        </h2>
        <p className="text-xs text-muted-foreground">Last {WEEKS} weeks · Mon–Sun</p>
      </div>
      <ol className="mt-5 grid h-36 grid-cols-8 items-end gap-2 sm:gap-3">
        {weeks.map((w, i) => {
          const v = values[i];
          const label = new Date(`${w}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
          return (
            <li key={w} className="flex h-full flex-col items-center justify-end gap-1.5">
              <span className={`${numericFigures} text-[11px] font-semibold ${v ? "text-foreground" : "text-transparent"}`}>
                +{fmtMarks(v)}
              </span>
              <span
                className={`w-full max-w-10 rounded-t-md ${v ? "bg-accent" : "bg-rule"}`}
                style={{ height: v ? `${Math.max((v / max) * 100, 6)}%` : "3px" }}
                role="img"
                aria-label={`Week of ${label}: ${v ? `+${fmtMarks(v)} marks` : "none"}`}
              />
              <span className={`${numericFigures} text-[10.5px] ${i === WEEKS - 1 ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                {i === WEEKS - 1 ? "This wk" : label}
              </span>
            </li>
          );
        })}
      </ol>
      {earlier > 0 ? (
        <p className={`${numericFigures} mt-3 text-xs text-muted-foreground`}>
          Plus +{fmtMarks(earlier)} won back before this window.
        </p>
      ) : null}
    </section>
  );
}

// ─── Per question ────────────────────────────────────────────────────────────

export function ReattemptTable({ gain }: { gain: ReattemptGain }) {
  const rows = gain.questions.slice(0, MAX_ROWS);
  return (
    <section className="mt-8" aria-labelledby="reattempt-list">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="reattempt-list" className={dashHeading}>
          Your reattempts
        </h2>
        <p className="text-xs text-muted-foreground">First mark against your best one since</p>
      </div>
      <div className={`${dashCard} mt-4 overflow-hidden`}>
        <div className="hidden grid-cols-[minmax(0,1fr)_9rem_4rem_6rem] gap-x-4 border-b border-border px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:grid">
          <span>Question</span>
          <span className="text-center">First → Best</span>
          <span className="text-center">Gain</span>
          <span className="sr-only">Action</span>
        </div>
        <ul className="divide-y divide-border">
          {rows.map((q) => {
            const open = q.best < q.total;
            return (
              <li
                key={q.questionId}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-3.5 sm:grid-cols-[minmax(0,1fr)_9rem_4rem_6rem]"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium text-foreground">{questionLabel(q)}</p>
                  <p className={`${numericFigures} truncate text-[11.5px] text-muted-foreground`}>
                    {q.chapter ? `${q.chapter} · ` : ""}
                    {q.attempts} attempts{q.latest < q.best ? ` · latest ${fmtMarks(q.latest)}` : ""}
                  </p>
                </div>
                <p className={`${numericFigures} text-right text-[13.5px] text-foreground sm:text-center`}>
                  {fmtMarks(q.first)}/{fmtMarks(q.total)} → <span className="font-semibold">{fmtMarks(q.best)}/{fmtMarks(q.total)}</span>
                </p>
                <p className="sm:text-center">
                  {q.gain > 0 ? (
                    <span className={`${numericFigures} inline-block rounded-md bg-awarded-subtle px-2 py-0.5 text-[12.5px] font-semibold text-status-correct`}>
                      +{fmtMarks(q.gain)}
                    </span>
                  ) : (
                    <span className="text-[12.5px] text-muted-foreground">No gain yet</span>
                  )}
                </p>
                <p className="text-right">
                  {open ? (
                    <Link href={reattemptHref(q)} className={tryAgain}>
                      Try again <ArrowRight size={13} aria-hidden />
                      <span className="sr-only">: {questionLabel(q)}</span>
                    </Link>
                  ) : (
                    <span className="text-[12.5px] font-medium text-status-correct">Full marks</span>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
      {gain.questions.length > rows.length ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Showing the {rows.length} biggest gains of {gain.questions.length} reattempted questions.
        </p>
      ) : null}
    </section>
  );
}

// ─── Nothing reattempted yet ─────────────────────────────────────────────────
// Instead of an empty table: the written questions with the most marks still
// on the table, each one tap from a second try.

export function ReattemptCandidates({ attempts }: { attempts: ProgressAttempt[] }) {
  const open = latestPerQuestion(attempts)
    .filter((a) => a.written && a.awarded < a.total)
    .sort((a, b) => b.total - b.awarded - (a.total - a.awarded) || Date.parse(b.submittedAt) - Date.parse(a.submittedAt))
    .slice(0, 5);

  if (!open.length) {
    return (
      <EmptyState
        icon={Repeat}
        title="No reattempts yet"
        description="Rewrite a written answer that fell short and the marks you win back show up here."
        primary={{ label: "Pick one from your results", href: "/history" }}
      />
    );
  }

  return (
    <section aria-labelledby="worth-retry">
      <div className={`${dashCard} p-5 sm:p-6`}>
        <h2 id="worth-retry" className={dashHeading}>
          No reattempts yet — start with these
        </h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Your written answers with the most marks still to win back. Rewrite one and your gain shows up here.
        </p>
        <ul className="mt-4 divide-y divide-border border-t border-border">
          {open.map((a) => (
            <li key={a.questionId} className="flex items-center gap-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-foreground">{questionLabel(a)}</p>
                <p className={`${numericFigures} text-[11.5px] leading-snug text-muted-foreground`}>
                  {a.chapter ? `${a.chapter} · ` : ""}scored {fmtMarks(a.awarded)}/{fmtMarks(a.total)}
                  <span className="font-semibold text-accent sm:hidden"> · {fmtMarks(a.total - a.awarded)} to win back</span>
                </p>
              </div>
              <span className={`${numericFigures} hidden shrink-0 text-[12.5px] font-semibold text-accent sm:inline`}>
                {fmtMarks(a.total - a.awarded)} to win back
              </span>
              <Link href={reattemptHref(a)} className={`${tryAgain} shrink-0`}>
                Try again <ArrowRight size={13} aria-hidden />
                <span className="sr-only">: {questionLabel(a)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
