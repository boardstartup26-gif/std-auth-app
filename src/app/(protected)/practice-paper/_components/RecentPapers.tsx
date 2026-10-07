// Recent practice papers as cards: where each one stands and the one action
// that makes sense for it (carry on, or see the results).

import Link from "next/link";
import { btnPrimary, btnSecondary, numericFigures } from "@/lib/ui";
import type { SetSummary } from "@/lib/practice-sets/read";
import { fmtMarks } from "@/lib/practice-sets/results";

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
}

const STATUS: Record<SetSummary["status"], { label: string; tone: string }> = {
  in_progress: { label: "In progress", tone: "border-border text-muted-foreground" },
  marking: { label: "Marking", tone: "border-status-partial text-foreground" },
  marked: { label: "Marked", tone: "border-status-correct text-status-correct" },
};

function Card({ s }: { s: SetSummary }) {
  const marked = s.status === "marked" && s.score !== null;
  const outOf = s.markedTotal ?? s.totalMarks;
  const percent = marked && outOf ? Math.round((s.score! / outOf) * 100) : null;
  const progress = marked ? (percent ?? 0) : Math.round((s.answeredCount / Math.max(1, s.questionCount)) * 100);

  return (
    <li className="flex flex-col rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-lg leading-tight text-foreground">{s.subject}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            <span className={numericFigures}>{s.questionCount}</span> questions ·{" "}
            <span className={numericFigures}>{fmtMarks(s.totalMarks)}</span> marks · {dateLabel(s.submittedAt ?? s.createdAt)}
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${STATUS[s.status].tone}`}>
          {STATUS[s.status].label}
        </span>
      </div>

      <div className="mt-5">
        {marked ? (
          <p className="flex items-baseline gap-2">
            <span className={`${numericFigures} font-display text-3xl text-foreground`}>
              {fmtMarks(s.score!)}
              <span className="text-lg text-muted-foreground">/{fmtMarks(outOf)}</span>
            </span>
            <span className={`${numericFigures} text-sm text-muted-foreground`}>{percent}%</span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            <span className={`${numericFigures} font-semibold text-foreground`}>{s.answeredCount}</span> of{" "}
            <span className={numericFigures}>{s.questionCount}</span> answered
          </p>
        )}
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-rule" aria-hidden>
          <div
            className={`h-full rounded-full ${marked ? "bg-status-correct" : "bg-accent"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <Link
        href={`/practice-paper/${s.id}`}
        className={`${s.status === "marked" ? btnSecondary : btnPrimary} mt-5 w-full`}
      >
        {s.status === "marked" ? "View Results" : s.status === "marking" ? "See Marking" : "Continue Paper"}
      </Link>
    </li>
  );
}

export function RecentPapers({ sets }: { sets: SetSummary[] }) {
  if (!sets.length) return null;
  return (
    <section className="mt-10" aria-labelledby="recent-papers">
      <h2 id="recent-papers" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Your recent papers
      </h2>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sets.map((s) => (
          <Card key={s.id} s={s} />
        ))}
      </ul>
    </section>
  );
}
