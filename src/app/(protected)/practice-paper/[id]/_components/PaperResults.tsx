// The marked paper: the score first, then what it's made of (how the answers
// split, marks by chapter, an examiner's summary, the marks left behind and
// why), then every question, collapsible. All of it is worked out from the
// stored evaluations by src/lib/practice-sets/results.ts.

import Link from "next/link";
import { btnPrimary, btnSecondary, numericFigures } from "@/lib/ui";
import { SET_TYPES } from "@/lib/practice-sets/constants";
import type { Paper } from "@/lib/practice-sets/read";
import { analysePaper, fmtMarks, type Outcome } from "@/lib/practice-sets/results";
import { mcqOptionLabel, mcqOptionValue } from "../../../evaluate/_lib/question";
import { retryMissed } from "../../actions";
import { ScoreReveal } from "./ScoreReveal";
import { ResultsList, type ResultRow } from "./ResultsList";
import { RetryButton } from "./RetryButton";

function dateLabel(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long" });
}

function answerDisplay(q: Paper["questions"][number], raw: string): string {
  const opts = q.question.options;
  if (q.question.question_type !== "mcq" || !opts?.length || !raw) return raw;
  const opt = opts.find((o) => mcqOptionValue(o) === raw);
  return opt ? mcqOptionLabel(opt) : raw;
}

const TILES: { key: Outcome; label: string; tone: string }[] = [
  { key: "full", label: "Full marks", tone: "bg-status-correct" },
  { key: "partial", label: "Partial", tone: "bg-status-partial" },
  { key: "incorrect", label: "Incorrect", tone: "bg-status-wrong" },
  { key: "unanswered", label: "Not attempted", tone: "bg-muted-foreground/40" },
];

export function PaperResults({ paper }: { paper: Paper }) {
  const a = analysePaper(paper);
  const retryCount = a.outcomes.filter((o) => o.outcome !== "full").length;
  const mistakes = a.counts.partial + a.counts.incorrect + a.counts.unanswered;

  // Section letters as the paper showed them (A, B, C from the sections present).
  const present = SET_TYPES.filter((t) => paper.questions.some((q) => q.type === t.key));
  const sectionName = (type: string | null) => {
    const i = present.findIndex((t) => t.key === type);
    return i >= 0 ? `Section ${String.fromCharCode(65 + i)} · ${present[i].label}` : "Other";
  };

  const rows: ResultRow[] = a.outcomes.map((o) => ({
    questionId: o.question.id,
    number: o.question.number,
    section: sectionName(o.question.type),
    chapter: o.question.chapter,
    marks: o.question.marks,
    awarded: o.awarded,
    outcome: o.outcome,
    objective: o.question.type === "objective",
    questionText: o.question.question.question_text,
    answer: answerDisplay(o.question, o.answer),
    result: o.result,
  }));

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <Link href="/practice-paper" className="text-sm text-muted-foreground hover:text-foreground">
        Practice papers
      </Link>
      <p className="mt-6 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {paper.spec.retryOf ? "Retry paper" : "Practice paper"} · {paper.subject} · Marked {dateLabel(paper.markedAt)}
      </p>

      {/* ── Score ── */}
      <section className="mt-4 overflow-hidden rounded-3xl border border-border bg-card">
        <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-center">
          <ScoreReveal score={a.score} outOf={a.outOf} percent={a.percent} />

          <dl className="grid grid-cols-2 gap-3">
            {TILES.map((t) => (
              <div key={t.key} className="rounded-xl border border-rule bg-background/40 px-4 py-3">
                <dt className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span aria-hidden className={`h-2 w-2 rounded-full ${t.tone}`} />
                  {t.label}
                </dt>
                <dd className={`${numericFigures} mt-1 font-display text-2xl text-foreground`}>{a.counts[t.key]}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-rule px-6 py-4 text-sm text-muted-foreground sm:px-10">
          <span>
            <span className={`${numericFigures} font-semibold text-foreground`}>{paper.questions.length}</span> questions
          </span>
          <span>
            <span className={`${numericFigures} font-semibold text-foreground`}>{fmtMarks(a.outOf)}</span> marks
          </span>
          {a.minutesTaken ? (
            <span>
              <span className={`${numericFigures} font-semibold text-foreground`}>{a.minutesTaken}</span> min taken
            </span>
          ) : null}
          {a.counts.unmarked ? (
            <span>
              <span className={`${numericFigures} font-semibold text-foreground`}>{a.counts.unmarked}</span> not marked
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3 border-t border-rule px-6 py-5 sm:px-10">
          {mistakes > 0 ? (
            <a href="#mistakes" className={`${btnPrimary} h-11 px-6`}>
              Review Mistakes
            </a>
          ) : null}
          {retryCount > 0 ? (
            <form action={retryMissed.bind(null, paper.id)}>
              <RetryButton className={`${btnSecondary} h-11`} count={retryCount} />
            </form>
          ) : null}
          <Link
            href={`/practice-paper?subject=${encodeURIComponent(paper.subject)}`}
            className={`${mistakes > 0 ? btnSecondary : btnPrimary} h-11`}
          >
            Generate Another Paper
          </Link>
        </div>
      </section>

      {/* ── Examiner summary ── */}
      <section className="mt-8 rounded-2xl border border-tag-examiner-feedback bg-tag-examiner-feedback-subtle p-6 sm:p-8">
        <h2 className="text-xs font-bold uppercase tracking-wider text-tag-examiner-feedback">Examiner summary</h2>
        <div className="mt-3 max-w-[var(--measure)] space-y-3 font-display text-lg leading-relaxed text-foreground">
          {a.summary.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        {/* ── Chapters ── */}
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-xl text-foreground">By chapter</h2>
          <ul className="mt-5 space-y-4">
            {[...a.chapters].reverse().map((c) => {
              const pct = c.possible ? Math.round((c.scored / c.possible) * 100) : 0;
              return (
                <li key={c.name}>
                  <div className="flex items-baseline justify-between gap-4 text-sm">
                    <span className="min-w-0 truncate text-foreground">{c.name}</span>
                    <span className={`${numericFigures} shrink-0 text-muted-foreground`}>
                      <span className="font-semibold text-foreground">{fmtMarks(c.scored)}</span>/{fmtMarks(c.possible)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-rule" aria-hidden>
                    <div
                      className={`h-full rounded-full ${pct >= 75 ? "bg-status-correct" : pct >= 40 ? "bg-status-partial" : "bg-status-wrong"}`}
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ── Marks left behind ── */}
        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-xl text-foreground">Marks you left behind</h2>
            {a.leftBehind.length ? (
              <span className={`${numericFigures} text-sm text-muted-foreground`}>
                {fmtMarks(a.outOf - a.score)} {a.outOf - a.score === 1 ? "mark" : "marks"}
              </span>
            ) : null}
          </div>
          {a.leftBehind.length ? (
            <ul className="mt-4 divide-y divide-rule">
              {a.leftBehind.slice(0, 8).map((l) => (
                <li key={l.questionId}>
                  <a href={`#q-${l.number}`} className="group flex items-start gap-3 py-3">
                    <span className={`${numericFigures} w-12 shrink-0 font-semibold text-status-wrong`}>
                      −{fmtMarks(l.lost)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground group-hover:text-accent">
                        Question {l.number}
                        {l.chapter ? <span className="font-normal text-muted-foreground"> · {l.chapter}</span> : null}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{l.reason}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">None. Every answer earned full marks.</p>
          )}
          {a.leftBehind.length > 8 ? (
            <a href="#mistakes" className="mt-2 inline-block text-sm font-medium text-accent hover:underline">
              See all {a.leftBehind.length}
            </a>
          ) : null}
        </section>
      </div>

      <div className="mt-12">
        <ResultsList rows={rows} />
      </div>
    </div>
  );
}
