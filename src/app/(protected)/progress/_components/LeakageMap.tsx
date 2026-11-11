// The Leakage Map: how much is lost (marks), why (causes, as counts), and
// where (chapters, in marks). Server component — receives derived figures only.
//
// Units are kept honest and labelled on the page: the ring's centre and the
// chapter bars are exact marks; the ring's segments and legend are each
// cause's share of the slips found. Stored evaluations can't split a lost mark
// across causes (see lib/progress/leakage.ts), so a "42% of marks lost to
// missing keywords" figure would be invented.

import { fmtMarks } from "@/lib/practice-sets/results";
import { LEAK_REASON_LABELS, LEAK_REASONS, topReasons, type LeakReason, type LeakageSummary } from "@/lib/progress";
import { numericFigures } from "@/lib/ui";
import { dashCard, dashHeading } from "@/app/(protected)/dashboard/_lib/styles";

const MAX_CHAPTERS = 8;

// Tints of the one accent, strongest for the most frequent cause — the
// reference's palette, and no new hues on the page.
const TINTS = [1, 0.72, 0.5, 0.32, 0.18];

const REASON_HINT: Record<LeakReason, string> = {
  point_missed: "A point in the marking scheme your answer didn’t make.",
  point_partial: "Made the point, but not fully enough for all its marks.",
  conceptual: "The idea itself was wrong, not just how it was put.",
  presentation: "Right idea, but wording, terms or layout cost marks.",
  objective_wrong: "An MCQ or one-word answer that didn’t match the key.",
};

function Ring({ segments, percent }: { segments: { share: number; tint: number }[]; percent: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  // Each segment starts where the previous ones end.
  const starts = segments.map((_, i) => segments.slice(0, i).reduce((sum, s) => sum + s.share * c, 0));
  return (
    <div className="relative mx-auto h-44 w-44 shrink-0 sm:h-48 sm:w-48">
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" aria-hidden focusable="false">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--rule)" strokeWidth="22" />
        {segments.map((s, i) => (
          <circle
            key={i}
            cx="70"
            cy="70"
            r={r}
            fill="none"
            stroke="var(--accent)"
            strokeOpacity={s.tint}
            strokeWidth="22"
            strokeDasharray={`${Math.max(s.share * c - 1.5, 0)} ${c}`}
            strokeDashoffset={-starts[i]}
          />
        ))}
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <p className={`${numericFigures} font-display text-[2.1rem] font-semibold leading-none text-foreground`}>{percent}%</p>
        <p className="mt-1 text-[11.5px] leading-tight text-muted-foreground">
          of marks
          <br />
          lost
        </p>
      </div>
    </div>
  );
}

export function LeakageCauses({ leakage }: { leakage: LeakageSummary }) {
  const reasons = LEAK_REASONS.map((r) => ({ reason: r, count: leakage.reasons[r] }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
  const totalSlips = reasons.reduce((s, r) => s + r.count, 0);
  const rows = reasons.map((r, i) => ({ ...r, share: totalSlips ? r.count / totalSlips : 0, tint: TINTS[i] ?? 0.15 }));
  const percent = leakage.possible ? Math.round((leakage.lost / leakage.possible) * 100) : 0;
  const presentationPartial = leakage.writtenQuestions > 0 && leakage.presentationTracked < leakage.writtenQuestions;

  return (
    <section className={`${dashCard} p-5 sm:p-6`} aria-labelledby="leak-why">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="leak-why" className={dashHeading}>
          Why marks are lost
        </h2>
        <p className={`${numericFigures} text-xs text-muted-foreground`}>
          <span className="font-semibold text-foreground">−{fmtMarks(leakage.lost)}</span> of {fmtMarks(leakage.possible)} marks ·{" "}
          {leakage.questionsBelowFull} of {leakage.questions} questions below full marks
        </p>
      </div>

      <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-10">
        <Ring segments={rows} percent={percent} />
        {rows.length ? (
          <ul className="w-full min-w-0 flex-1 space-y-3">
            {rows.map(({ reason, count, share, tint }) => (
              <li key={reason} className="grid grid-cols-[0.875rem_minmax(0,1fr)_auto] items-start gap-x-3">
                <span
                  aria-hidden
                  className="mt-1 h-3.5 w-3.5 rounded-sm"
                  style={{ background: `color-mix(in srgb, var(--accent) ${Math.round(tint * 100)}%, transparent)` }}
                />
                <div className="min-w-0">
                  <p className="text-[13.5px] font-medium text-foreground">{LEAK_REASON_LABELS[reason]}</p>
                  <p className="text-[11.5px] leading-snug text-muted-foreground">{REASON_HINT[reason]}</p>
                </div>
                <p className={`${numericFigures} text-right`}>
                  <span className="text-[13.5px] font-semibold text-foreground">{Math.round(share * 100)}%</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {count} {count === 1 ? "time" : "times"}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {leakage.lost > 0
              ? "Marks were lost, but no specific causes were recorded on these answers."
              : "Nothing lost on your latest attempts — every question is at full marks."}
          </p>
        )}
      </div>

      <p className="mt-5 border-t border-border pt-3 text-[11.5px] leading-relaxed text-muted-foreground">
        The centre figure is marks lost out of marks available. The ring shows each cause&rsquo;s share of the slips the
        examiner found — counts, not marks, since one answer can have several.
        {presentationPartial ? (
          <>
            {" "}
            Presentation &amp; terminology is only recorded on newer answers ({leakage.presentationTracked} of{" "}
            {leakage.writtenQuestions} written questions so far), so it may be undercounted.
          </>
        ) : null}
      </p>
    </section>
  );
}

export function LeakageByChapter({ leakage, showSubject }: { leakage: LeakageSummary; showSubject: boolean }) {
  const leaking = leakage.byChapter.filter((c) => c.lost > 0);
  const shown = leaking.slice(0, MAX_CHAPTERS);

  return (
    <section className="mt-8" aria-labelledby="leak-where">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="leak-where" className={dashHeading}>
          Topic-wise leakage
        </h2>
        <p className="text-xs text-muted-foreground">Share of each chapter&rsquo;s marks lost</p>
      </div>

      <div className={`${dashCard} mt-4 p-5 sm:p-6`}>
        {shown.length ? (
          <ul className="space-y-4">
            {shown.map((c) => {
              const pct = c.possible ? Math.round((c.lost / c.possible) * 100) : 0;
              const top = topReasons(c.reasons, 1)[0];
              return (
                <li
                  key={`${c.subject}|${c.chapter ?? ""}`}
                  className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_3rem]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium text-foreground">
                      {c.chapter ?? <span className="text-muted-foreground">Chapter not recorded</span>}
                      {showSubject ? <span className="font-normal text-muted-foreground"> ({c.subject})</span> : null}
                    </p>
                    <p className={`${numericFigures} text-[11px] leading-snug text-muted-foreground`}>
                      −{fmtMarks(c.lost)} of {fmtMarks(c.possible)} · {c.questionsBelowFull}/{c.questions} below full
                      {top ? ` · mostly ${LEAK_REASON_LABELS[top.reason].toLowerCase()}` : ""}
                    </p>
                  </div>
                  <div
                    className="order-last col-span-2 h-2 overflow-hidden rounded-full bg-rule sm:order-none sm:col-span-1"
                    role="img"
                    aria-label={`${pct}% of marks lost`}
                  >
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(pct, 2)}%` }} />
                  </div>
                  <p className={`${numericFigures} text-right text-[13.5px] font-semibold text-foreground`}>{pct}%</p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing lost on your latest attempts — every question is at full marks.</p>
        )}
        {leaking.length > shown.length ? (
          <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
            +{leaking.length - shown.length} more chapter{leaking.length - shown.length === 1 ? "" : "s"} with smaller losses
          </p>
        ) : null}
      </div>
    </section>
  );
}
