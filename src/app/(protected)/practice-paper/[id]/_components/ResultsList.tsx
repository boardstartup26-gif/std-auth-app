"use client";

// Every question on the marked paper as a collapsible row: a one-line header
// (number, section, chapter, mark) and, opened, the student's answer, the
// scheme points hit and missed, examiner feedback and the model answer.
//
// The page's "Review Mistakes" link and the "Marks you left behind" entries
// address this list by URL hash (#mistakes, #q-4), so they work as plain links
// from the server-rendered page around it.

import { useCallback, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { numericFigures, scoreBadgeClass } from "@/lib/ui";
import type { QuestionResult } from "@/lib/practice-sets/read";
import type { Outcome } from "@/lib/practice-sets/results";

export interface ResultRow {
  questionId: string;
  number: number;
  section: string;
  chapter: string | null;
  marks: number;
  awarded: number;
  outcome: Outcome;
  objective: boolean;
  questionText: string;
  /** What the student wrote, with an MCQ choice shown as its option text. */
  answer: string;
  result: QuestionResult | null;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

const OUTCOME_LABEL: Record<Outcome, string> = {
  full: "Full marks",
  partial: "Partial",
  incorrect: "Incorrect",
  unanswered: "Not attempted",
  unmarked: "Not marked",
};

const isMistake = (r: ResultRow) => r.outcome === "partial" || r.outcome === "incorrect" || r.outcome === "unanswered";

function PointIcon({ status }: { status: "awarded" | "partial" | "missed" }) {
  const cls =
    status === "awarded"
      ? "border-status-correct bg-status-correct-subtle text-status-correct"
      : status === "partial"
        ? "border-status-partial bg-status-partial-subtle text-foreground"
        : "border-status-wrong bg-status-wrong-subtle text-status-wrong";
  return (
    <span aria-hidden className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] font-bold ${cls}`}>
      {status === "awarded" ? "✓" : status === "partial" ? "½" : "✕"}
    </span>
  );
}

function Detail({ row }: { row: ResultRow }) {
  const r = row.result;
  return (
    <div className="space-y-6 border-t border-rule px-4 pb-6 pt-5 sm:px-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Question</p>
        <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-foreground">{row.questionText}</p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your answer</p>
        {row.answer.trim() ? (
          <p className="mt-2 whitespace-pre-wrap rounded-xl border border-rule bg-background/50 px-4 py-3 text-[15px] leading-relaxed text-foreground">
            {row.answer}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Left blank. Retry the missed questions to attempt it.</p>
        )}
      </div>

      {row.outcome === "unmarked" ? (
        <p className="text-sm text-muted-foreground">
          We couldn’t mark this answer, so it’s left out of your total and its credit was returned.
        </p>
      ) : null}

      {r && row.objective ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            row.outcome === "full" ? "border-status-correct bg-status-correct-subtle" : "border-status-wrong bg-status-wrong-subtle"
          }`}
        >
          <p className={`font-medium ${row.outcome === "full" ? "text-status-correct" : "text-status-wrong"}`}>
            {row.outcome === "full" ? "Correct" : "Incorrect"}
          </p>
          {row.outcome !== "full" && r.modelAnswer ? (
            <p className="mt-1 text-foreground/90">
              Correct answer: <span className="font-medium">{r.modelAnswer}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      {r && !row.objective ? (
        <>
          {r.markingPoints.length ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Marking points</p>
              <ul className="mt-3 space-y-2.5">
                {r.markingPoints.map((p, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm leading-relaxed">
                    <PointIcon status={p.status} />
                    <span className="min-w-0 flex-1 text-foreground/90">{p.point}</span>
                    <span className={`${numericFigures} shrink-0 text-xs text-muted-foreground`}>
                      {fmt(p.marks_awarded)}/{fmt(p.marks)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {r.conceptualErrors.length ? (
            <div className="rounded-xl border border-tag-conceptual bg-tag-conceptual-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-tag-conceptual">Conceptual errors</p>
              <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-foreground/90">
                {r.conceptualErrors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {r.examinerFeedback ? (
            <div className="rounded-xl border border-tag-examiner-feedback bg-tag-examiner-feedback-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-tag-examiner-feedback">Examiner feedback</p>
              <p className="mt-2 text-sm leading-relaxed text-foreground/90">{r.examinerFeedback}</p>
            </div>
          ) : null}

          {r.modelAnswer ? (
            <div className="rounded-xl border border-tag-model-answer bg-tag-model-answer-subtle p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-tag-model-answer">Model answer</p>
                {r.modelAnswerSource === "ai_generated" ? (
                  <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">AI generated</span>
                ) : null}
              </div>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/90">{r.modelAnswer}</p>
            </div>
          ) : null}

          {r.improvementTips.length ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">How to improve</p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-foreground/90">
                {r.improvementTips.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ol>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function ResultsList({ rows }: { rows: ResultRow[] }) {
  const [filter, setFilter] = useState<"all" | "mistakes">("all");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const fromHash = useCallback(() => {
    const hash = window.location.hash;
    if (hash === "#mistakes") {
      setFilter("mistakes");
      const first = rows.find(isMistake);
      if (first) setOpen(new Set([first.questionId]));
      requestAnimationFrame(() => document.getElementById("answers")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      return;
    }
    const m = hash.match(/^#q-(\d+)$/);
    if (m) {
      const row = rows.find((r) => r.number === Number(m[1]));
      if (!row) return;
      setFilter("all");
      setOpen((prev) => new Set(prev).add(row.questionId));
      requestAnimationFrame(() =>
        document.getElementById(`q-${row.number}`)?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    }
  }, [rows]);

  useEffect(() => {
    // The page may open with a hash, and in-page links change it later.
    const t = setTimeout(fromHash, 0);
    // Clicking a link to the hash already in the URL fires no hashchange, so
    // a second "Review Mistakes" would do nothing without this.
    const onClick = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.("a[href^='#']");
      if (link && link.getAttribute("href") === window.location.hash) setTimeout(fromHash, 0);
    };
    window.addEventListener("hashchange", fromHash);
    document.addEventListener("click", onClick);
    return () => {
      clearTimeout(t);
      window.removeEventListener("hashchange", fromHash);
      document.removeEventListener("click", onClick);
    };
  }, [fromHash]);

  const mistakes = rows.filter(isMistake).length;
  const shown = filter === "mistakes" ? rows.filter(isMistake) : rows;
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section id="answers" className="scroll-mt-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="font-display text-2xl text-foreground">Question by question</h2>
        <div className="flex items-center gap-3">
          <div className="grid grid-cols-2 rounded-xl border border-border bg-card p-1 text-sm" role="tablist" aria-label="Show">
            {(["all", "mistakes"] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={`rounded-lg px-3 py-1.5 transition-colors ${
                  filter === f ? "bg-accent-subtle font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "all" ? `All (${rows.length})` : `Mistakes (${mistakes})`}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setOpen((prev) => (prev.size ? new Set() : new Set(shown.map((r) => r.questionId))))}
            className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {open.size ? "Collapse all" : "Expand all"}
          </button>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-border bg-card px-6 py-8 text-center text-sm text-muted-foreground">
          No mistakes on this paper. Every answer got full marks.
        </p>
      ) : (
        <ul className="mt-5 space-y-2.5">
          {shown.map((row) => {
            const isOpen = open.has(row.questionId);
            return (
              <li key={row.questionId} id={`q-${row.number}`} className="scroll-mt-6 overflow-hidden rounded-2xl border border-border bg-card">
                <button
                  type="button"
                  onClick={() => toggle(row.questionId)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-surface-raised/50 sm:px-6"
                >
                  <span className={`${numericFigures} w-7 shrink-0 font-display text-lg text-accent`}>{row.number}.</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {row.section}
                      {row.chapter ? ` · ${row.chapter}` : ""}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-foreground">{row.questionText.replace(/\s+/g, " ")}</span>
                  </span>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">{OUTCOME_LABEL[row.outcome]}</span>
                  <span className={`${scoreBadgeClass(row.outcome === "unmarked" ? 0 : row.awarded, row.outcome === "unmarked" ? 0 : row.marks)} shrink-0`}>
                    {row.outcome === "unmarked" ? "–" : `${fmt(row.awarded)}/${fmt(row.marks)}`}
                  </span>
                  <ChevronDown
                    size={18}
                    aria-hidden
                    className={`shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {isOpen ? <Detail row={row} /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
