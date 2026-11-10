// The Leakage Map: where marks are lost (chapters, in marks) and why (reasons,
// as counts). Server component — receives derived figures only.
//
// The two halves use different units on purpose and say so on the page:
// chapter losses are exact marks, reasons are occurrence counts. Stored
// evaluations can't honestly split a lost mark across reasons (see
// lib/progress/leakage.ts).

import { fmtMarks } from "@/lib/practice-sets/results";
import { LEAK_REASON_LABELS, LEAK_REASONS, type LeakReason, type LeakageSummary } from "@/lib/progress";
import { numericFigures } from "@/lib/ui";

const MAX_CHAPTERS = 8;

// Semantic tokens from the design system: grey is the "missed" state, gold is
// partial credit (bar only — gold as text fails contrast), red pen for a wrong
// objective answer, the conceptual tag for conceptual errors.
const REASON_BAR: Record<LeakReason, string> = {
  point_missed: "bg-muted-foreground",
  point_partial: "bg-status-partial",
  conceptual: "bg-tag-conceptual",
  presentation: "bg-foreground/70",
  objective_wrong: "bg-status-wrong",
};

const REASON_HINT: Record<LeakReason, string> = {
  point_missed: "A point in the marking scheme your answer didn’t make",
  point_partial: "Made the point, but not fully enough for all its marks",
  conceptual: "The idea itself was wrong, not just how it was put",
  presentation: "Right idea, but wording, terms or layout that cost marks",
  objective_wrong: "An MCQ or one-word answer that didn’t match the key",
};

export function LeakageMap({ leakage, showSubject }: { leakage: LeakageSummary; showSubject: boolean }) {
  const leaking = leakage.byChapter.filter((c) => c.lost > 0);
  const shown = leaking.slice(0, MAX_CHAPTERS);
  const reasons = LEAK_REASONS.map((r) => ({ reason: r, count: leakage.reasons[r] }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
  const maxCount = Math.max(1, ...reasons.map((r) => r.count));
  const presentationPartial = leakage.writtenQuestions > 0 && leakage.presentationTracked < leakage.writtenQuestions;

  return (
    <section className="mt-12" aria-labelledby="leakage-map">
      <h2 id="leakage-map" className="font-display text-2xl text-foreground">
        Leakage map
      </h2>
      <p className="mt-1 max-w-[var(--measure)] text-sm text-muted-foreground">
        Based on your latest attempt at each question — marks you&rsquo;ve since won back don&rsquo;t count as lost.
      </p>

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-6" aria-labelledby="leak-where">
          <div className="flex items-baseline justify-between gap-4">
            <h3 id="leak-where" className="font-display text-xl text-foreground">
              Where
            </h3>
            <span className="text-xs text-muted-foreground">Marks lost by chapter</span>
          </div>

          {shown.length ? (
            <ul className="mt-5 space-y-4">
              {shown.map((c) => {
                const pct = c.possible ? Math.round((c.lost / c.possible) * 100) : 0;
                return (
                  <li key={`${c.subject}|${c.chapter ?? ""}`}>
                    <div className="flex items-baseline justify-between gap-4 text-sm">
                      <span className="min-w-0 truncate text-foreground">
                        {c.chapter ?? <span className="text-muted-foreground">Chapter not recorded</span>}
                        {showSubject ? <span className="text-muted-foreground"> · {c.subject}</span> : null}
                      </span>
                      <span className={`${numericFigures} shrink-0 text-muted-foreground`}>
                        <span className="font-semibold text-foreground">−{fmtMarks(c.lost)}</span> of {fmtMarks(c.possible)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-rule" aria-hidden>
                      <div className="h-full rounded-full bg-status-wrong" style={{ width: `${Math.max(pct, 2)}%` }} />
                    </div>
                    <p className={`${numericFigures} mt-1 text-[11px] text-muted-foreground`}>
                      {c.questionsBelowFull} of {c.questions} question{c.questions === 1 ? "" : "s"} below full marks · {pct}% of
                      marks lost
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">
              Nothing lost on your latest attempts — every question is at full marks.
            </p>
          )}
          {leaking.length > shown.length ? (
            <p className="mt-4 text-xs text-muted-foreground">
              +{leaking.length - shown.length} more chapter{leaking.length - shown.length === 1 ? "" : "s"} with smaller losses
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-border bg-card p-6" aria-labelledby="leak-why">
          <div className="flex items-baseline justify-between gap-4">
            <h3 id="leak-why" className="font-display text-xl text-foreground">
              Why
            </h3>
            <span className="text-xs text-muted-foreground">How often each slip happened</span>
          </div>

          {reasons.length ? (
            <ul className="mt-5 space-y-4">
              {reasons.map(({ reason, count }) => (
                <li key={reason}>
                  <div className="flex items-baseline justify-between gap-4 text-sm">
                    <span className="min-w-0 text-foreground">{LEAK_REASON_LABELS[reason]}</span>
                    <span className={`${numericFigures} shrink-0 font-semibold text-foreground`}>{count}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-rule" aria-hidden>
                    <div
                      className={`h-full rounded-full ${REASON_BAR[reason]}`}
                      style={{ width: `${Math.max(Math.round((count / maxCount) * 100), 2)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{REASON_HINT[reason]}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">No specific slips flagged on your latest attempts.</p>
          )}

          <p className="mt-5 border-t border-rule pt-4 text-[11px] leading-relaxed text-muted-foreground">
            These are counts of mistakes, not marks — one answer can have several.
            {presentationPartial ? (
              <>
                {" "}
                Presentation &amp; terminology is only recorded on newer answers ({leakage.presentationTracked} of{" "}
                {leakage.writtenQuestions} written questions so far), so it may be undercounted.
              </>
            ) : null}
          </p>
        </section>
      </div>
    </section>
  );
}
