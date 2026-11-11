// The two practice actions, side by side: one question, or a full paper.
// The paper card is contextual — with a paper open it becomes that paper
// (answered count, where to pick up); while one is being marked it says so.
// Server component.

import Link from "next/link";
import { ArrowRight, Layers, Pencil } from "lucide-react";
import type { SetSummary } from "@/lib/practice-sets/read";
import { fmtMarks } from "@/lib/practice-sets/results";
import { numericFigures } from "@/lib/ui";
import { dashButton, dashCard, iconChip } from "../_lib/styles";
import { BookStackSketch, OpenBookSketch } from "./Illustrations";

const cardShell = `${dashCard} relative flex min-h-[13rem] flex-col overflow-hidden p-5 sm:p-6`;
const title = "mt-4 font-display text-xl font-semibold leading-snug tracking-[-0.01em] text-foreground";
const body = "mt-1.5 max-w-[17rem] text-[13px] leading-relaxed text-muted-foreground";
const sketch = "pointer-events-none absolute -bottom-1 right-2 hidden w-28 text-accent/60 sm:block";

function QuestionCard() {
  return (
    <section className={cardShell} aria-labelledby="pa-question">
      <span className={iconChip}>
        <Pencil size={18} strokeWidth={1.75} aria-hidden />
      </span>
      <h2 id="pa-question" className={title}>
        Practice one question
      </h2>
      <p className={body}>Solve a board-style question and get detailed, point-by-point feedback.</p>
      <div className="mt-auto pt-5">
        <Link href="/evaluate" className={dashButton}>
          Practice a question <ArrowRight size={14} strokeWidth={2} aria-hidden />
        </Link>
      </div>
      <BookStackSketch className={sketch} />
    </section>
  );
}

function BuildPaperCard() {
  return (
    <section className={cardShell} aria-labelledby="pa-paper">
      <span className={iconChip}>
        <Layers size={18} strokeWidth={1.75} aria-hidden />
      </span>
      <h2 id="pa-paper" className={title}>
        Build a full paper
      </h2>
      <p className={body}>Create a complete ICSE-style paper from real past questions and attempt it here.</p>
      <div className="mt-auto pt-5">
        <Link href="/practice-paper" className={dashButton}>
          Build a paper <ArrowRight size={14} strokeWidth={2} aria-hidden />
        </Link>
      </div>
      <OpenBookSketch className={sketch} />
    </section>
  );
}

function OpenPaperCard({ paper }: { paper: SetSummary }) {
  const marking = paper.status === "marking";
  const pct = Math.round((paper.answeredCount / Math.max(1, paper.questionCount)) * 100);

  return (
    <section className={`${cardShell} border-accent/30`} aria-labelledby="pa-paper">
      <div className="flex items-center justify-between gap-3">
        <span className={iconChip}>
          <Layers size={18} strokeWidth={1.75} aria-hidden />
        </span>
        <span className="rounded-full bg-accent-subtle px-2.5 py-1 text-[11px] font-semibold text-accent">
          {marking ? "Being marked" : "In progress"}
        </span>
      </div>
      <h2 id="pa-paper" className={title}>
        {marking ? `Your ${paper.subject} paper` : `Continue your ${paper.subject} paper`}
      </h2>
      <p className={`${body} ${numericFigures}`}>
        {paper.questionCount} questions · {fmtMarks(paper.totalMarks)} marks
        {marking ? " · results appear as soon as marking finishes" : ""}
      </p>

      {!marking ? (
        <div className="mt-4 max-w-[17rem]">
          <p className={`${numericFigures} flex items-baseline justify-between text-xs text-muted-foreground`}>
            <span>
              <span className="font-semibold text-foreground">{paper.answeredCount}</span> of {paper.questionCount} answered
            </span>
            <span>{pct}%</span>
          </p>
          <div
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-rule"
            role="img"
            aria-label={`${paper.answeredCount} of ${paper.questionCount} questions answered`}
          >
            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-5">
        <Link href={`/practice-paper/${paper.id}`} className={dashButton}>
          {marking ? "See marking" : "Continue paper"} <ArrowRight size={14} strokeWidth={2} aria-hidden />
        </Link>
        <Link
          href="/practice-paper"
          className="text-[13px] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Build a new paper
        </Link>
      </div>
    </section>
  );
}

export function PrimaryActions({ openPaper }: { openPaper: SetSummary | null }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <QuestionCard />
      {openPaper ? <OpenPaperCard paper={openPaper} /> : <BuildPaperCard />}
    </div>
  );
}
