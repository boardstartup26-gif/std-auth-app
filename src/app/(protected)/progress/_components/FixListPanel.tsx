// Fix List: one practice set per subject, aimed at that subject's weakest
// chapters, chosen from the student's own marked answers. One press builds a
// Quick-length paper (buildFixList); if a Fix List for that subject is already
// open, the same action sends the student back to it. The server action
// re-derives everything from the verified user's own data — the form carries
// only the subject. Server component.

import Link from "next/link";
import { ArrowRight, Target } from "lucide-react";
import { buildFixList } from "@/app/(protected)/practice-paper/actions";
import { PendingSubmit } from "@/app/_components/states/PendingSubmit";
import { topReasons, type ChapterLeak, type LeakReason, type ReasonCounts } from "@/lib/progress";
import { LEAK_REASONS } from "@/lib/progress";
import { fmtMarks } from "@/lib/practice-sets/results";
import { errorAlert, mutedPanel, numericFigures } from "@/lib/ui";
import { dashButton, dashCard, iconChip } from "@/app/(protected)/dashboard/_lib/styles";

export type FixNotice = "none" | "thin" | "error";

const NOTICE: Record<FixNotice, (subject: string) => string> = {
  none: (s) =>
    `There isn’t a weak chapter to target in ${s} yet — a chapter needs at least two marked questions with marks lost. Answer a few more and try again.`,
  thin: (s) =>
    `Your weakest ${s} chapters don’t have enough questions left that you haven’t already scored full marks on. Build a paper with more chapters instead.`,
  error: () => "We couldn’t build your Fix List just now. Please try again.",
};

/** What the chapters' most frequent slip says about the answers, in plain words. */
const REASON_NOTE: Record<LeakReason, string> = {
  point_missed: "Missing points the marking scheme expects.",
  point_partial: "Points made, but not fully enough for all their marks.",
  conceptual: "Conceptual errors in the explanation.",
  presentation: "Wording, key terms or layout costing marks.",
  objective_wrong: "Objective answers not matching the key.",
};

export interface FixTarget {
  subject: string;
  chapters: ChapterLeak[];
}

type Priority = "High" | "Medium" | "Low";

// Share of the available marks lost in the targeted chapters.
function priorityOf(share: number): Priority {
  if (share >= 0.5) return "High";
  if (share >= 0.3) return "Medium";
  return "Low";
}

const PRIORITY_CLASS: Record<Priority, string> = {
  High: "bg-accent-subtle text-accent",
  Medium: "bg-withheld-subtle text-foreground",
  Low: "bg-awarded-subtle text-status-correct",
};

function summarise(t: FixTarget) {
  const lost = t.chapters.reduce((s, c) => s + c.lost, 0);
  const possible = t.chapters.reduce((s, c) => s + c.possible, 0);
  const questions = t.chapters.reduce((s, c) => s + c.questions, 0);
  const reasons = Object.fromEntries(
    LEAK_REASONS.map((r) => [r, t.chapters.reduce((s, c) => s + c.reasons[r], 0)]),
  ) as ReasonCounts;
  const share = possible ? lost / possible : 0;
  return { lost, possible, questions, share, priority: priorityOf(share), top: topReasons(reasons, 1)[0] ?? null };
}

export function FixListPanel({
  targets,
  notice,
  noticeSubject,
}: {
  targets: FixTarget[];
  notice: FixNotice | null;
  noticeSubject: string | null;
}) {
  // After a "none"/"thin" result, offering the same subject's button again
  // would only fail the same way. An "error" may be transient: keep it.
  const shown = (notice && notice !== "error" ? targets.filter((t) => t.subject !== noticeSubject) : targets)
    .map((t) => ({ t, s: summarise(t) }))
    .sort((a, b) => b.s.share - a.s.share || b.s.lost - a.s.lost);

  return (
    <div>
      {notice ? (
        <p role="status" className={`mb-4 ${notice === "error" ? errorAlert : `${mutedPanel} text-sm text-foreground`}`}>
          {NOTICE[notice](noticeSubject ?? "this subject")}
          {notice === "thin" && noticeSubject ? (
            <>
              {" "}
              <Link
                href={`/practice-paper?subject=${encodeURIComponent(noticeSubject)}`}
                className="font-medium text-accent underline-offset-4 hover:underline"
              >
                Open the paper builder
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      {shown.length ? (
        <section className={`${dashCard} overflow-hidden`} aria-labelledby="fix-list">
          <div className="flex items-center gap-3 border-b border-border bg-accent-subtle/40 px-5 py-4 sm:px-6">
            <span className={iconChip}>
              <Target size={18} strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 id="fix-list" className="font-display text-xl font-semibold text-accent">
                {shown.length} focused practice {shown.length === 1 ? "set" : "sets"}
              </h2>
              <p className="text-xs text-muted-foreground">
                Automatically created from your marked answers — the chapters costing you the most.
              </p>
            </div>
          </div>

          <ul className="divide-y divide-border">
            {shown.map(({ t, s }, i) => (
              <li key={t.subject} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 sm:flex-nowrap sm:px-6">
                <span
                  aria-hidden
                  className={`${numericFigures} grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border text-xs text-muted-foreground`}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="text-[14px] font-semibold text-foreground">
                    {t.subject} <span className="font-normal text-muted-foreground">–</span>{" "}
                    {t.chapters.map((c) => c.chapter).join(", ")}
                  </p>
                  <p className={`${numericFigures} mt-0.5 text-xs text-muted-foreground`}>
                    {s.top ? `${REASON_NOTE[s.top.reason]} ` : ""}−{fmtMarks(s.lost)} of {fmtMarks(s.possible)} marks across{" "}
                    {s.questions} questions.
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${PRIORITY_CLASS[s.priority]}`}
                  title={`${Math.round(s.share * 100)}% of available marks lost in these chapters`}
                >
                  {s.priority}
                  <span className="sr-only"> priority, {Math.round(s.share * 100)}% of marks lost</span>
                </span>
                <form action={buildFixList} className="shrink-0">
                  <input type="hidden" name="subject" value={t.subject} />
                  <input type="hidden" name="src" value="progress" />
                  <PendingSubmit pendingLabel="Building…" className={dashButton}>
                    Practice <ArrowRight size={14} strokeWidth={2} aria-hidden />
                  </PendingSubmit>
                </form>
              </li>
            ))}
          </ul>

          <p className="border-t border-border px-5 py-3 text-[11.5px] leading-relaxed text-muted-foreground sm:px-6">
            Each set is a short paper of real past-paper questions from these chapters, skipping ones you&rsquo;ve already got
            full marks on. Priority is the share of available marks lost in them: High from 50%, Medium from 30%. A Fix List
            you&rsquo;ve started opens where you left off.
          </p>
        </section>
      ) : null}
    </div>
  );
}
