// Fix List: one press builds a Quick-length paper from the student's weakest
// chapters in a subject, chosen from their own marked answers. Server
// component; the button is the shared PendingSubmit so a slow build shows
// life. The server action re-derives everything from the verified user's own
// data — the form carries only the subject.

import Link from "next/link";
import { Wrench } from "lucide-react";
import { buildFixList } from "@/app/(protected)/practice-paper/actions";
import { PendingSubmit } from "@/app/_components/states/PendingSubmit";
import type { ChapterLeak } from "@/lib/progress";
import { btnPrimary, btnSecondary, errorAlert, mutedPanel } from "@/lib/ui";

export type FixNotice = "none" | "thin" | "error";

const NOTICE: Record<FixNotice, (subject: string) => string> = {
  none: (s) =>
    `There isn’t a weak chapter to target in ${s} yet — a chapter needs at least two marked questions with marks lost. Answer a few more and try again.`,
  thin: (s) =>
    `Your weakest ${s} chapters don’t have enough questions left that you haven’t already scored full marks on. Build a paper with more chapters instead.`,
  error: () => "We couldn’t build your Fix List just now. Please try again.",
};

export interface FixTarget {
  subject: string;
  chapters: ChapterLeak[];
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
  const shown =
    notice && notice !== "error" ? targets.filter((t) => t.subject !== noticeSubject) : targets;
  if (!shown.length && !notice) return null;

  return (
    <section className="mt-12" aria-labelledby="fix-list">
      <div className="flex items-baseline gap-2">
        <Wrench size={18} strokeWidth={1.75} aria-hidden className="translate-y-0.5 text-muted-foreground" />
        <h2 id="fix-list" className="font-display text-2xl text-foreground">
          Fix list
        </h2>
      </div>
      <p className="mt-1 max-w-[var(--measure)] text-sm text-muted-foreground">
        A short paper of real past-paper questions from the chapters costing you the most, skipping ones you&rsquo;ve
        already got full marks on. Nothing to set up.
      </p>

      {notice ? (
        <p
          role="status"
          className={`mt-5 ${notice === "error" ? errorAlert : `${mutedPanel} text-sm text-foreground`}`}
        >
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
        <ul className="mt-6 border-b border-border">
          {shown.map((t, i) => (
            <li
              key={t.subject}
              className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-border py-4"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{t.subject}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Starting with {t.chapters.map((c) => c.chapter).join(" and ")}
                </p>
              </div>
              <form action={buildFixList}>
                <input type="hidden" name="subject" value={t.subject} />
                <input type="hidden" name="src" value="progress" />
                <PendingSubmit pendingLabel="Building…" className={i === 0 ? btnPrimary : btnSecondary}>
                  Build my Fix List
                </PendingSubmit>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
