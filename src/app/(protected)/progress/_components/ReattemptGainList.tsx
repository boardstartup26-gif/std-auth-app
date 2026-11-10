// Reattempt Gain: per question, the first mark against the best later one.
// Server component — derived figures only.
//
// Written questions only (lib/progress/gain.ts explains why MCQ retries
// don't count). A question not yet at full marks links straight back into
// /evaluate with the same deep link the reattempt prompts use.

import Link from "next/link";
import { ArrowRight, Repeat } from "lucide-react";
import { fmtMarks } from "@/lib/practice-sets/results";
import { questionLabel, reattemptHref } from "@/lib/notifications/reattempt-copy";
import type { ReattemptGain } from "@/lib/progress";
import { EmptyState } from "@/app/_components/states/EmptyState";
import { numericFigures } from "@/lib/ui";

const MAX_ROWS = 10;

export function ReattemptGainList({ gain }: { gain: ReattemptGain }) {
  const rows = gain.questions.slice(0, MAX_ROWS);

  return (
    <section className="mt-12" aria-labelledby="reattempt-gain">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="reattempt-gain" className="font-display text-2xl text-foreground">
          Reattempt gain
        </h2>
        {gain.reattempted ? (
          <span className={`${numericFigures} text-sm text-muted-foreground`}>
            <span className="font-semibold text-status-correct">+{fmtMarks(gain.marksRecovered)}</span> marks won back
          </span>
        ) : null}
      </div>
      <p className="mt-1 max-w-[var(--measure)] text-sm text-muted-foreground">
        Your first mark on a written question against your best one since.
      </p>

      {rows.length === 0 ? (
        <EmptyState
          className="mt-6"
          compact
          icon={Repeat}
          title="No reattempts yet"
          description="Rewrite a written answer that fell short and the marks you win back show up here."
          primary={{ label: "Pick one from your results", href: "/history" }}
        />
      ) : (
        <ul className="mt-6 border-b border-border">
          {rows.map((q) => {
            const open = q.best < q.total;
            return (
              <li key={q.questionId} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border py-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{questionLabel(q)}</p>
                  <p className={`${numericFigures} mt-0.5 text-xs text-muted-foreground`}>
                    {q.chapter ? `${q.chapter} · ` : ""}
                    {fmtMarks(q.first)} → {fmtMarks(q.best)} of {fmtMarks(q.total)} · {q.attempts} attempts
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  {q.gain > 0 ? (
                    <span className={`${numericFigures} text-sm font-semibold text-status-correct`}>+{fmtMarks(q.gain)}</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">No gain yet</span>
                  )}
                  {open ? (
                    <Link
                      href={reattemptHref(q)}
                      className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-hover"
                    >
                      Try again <ArrowRight size={14} aria-hidden />
                    </Link>
                  ) : (
                    <span className="text-sm text-status-correct">Full marks</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {gain.questions.length > rows.length ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Showing the {rows.length} biggest gains of {gain.questions.length} reattempted questions.
        </p>
      ) : null}
    </section>
  );
}
