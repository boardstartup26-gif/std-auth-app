// src/lib/practice-sets/results.ts
//
// Turns a marked paper into what the results page shows: the score, how the
// answers split (full / partial / wrong / blank), marks by chapter, where the
// marks were lost and why, and a short examiner-style summary.
//
// Pure and deterministic. The summary is written from the evaluations
// themselves, never by a model, so it can't claim anything the marking
// didn't find, and it costs nothing.

import type { Paper, PaperQuestion, QuestionResult } from "./read";

export type Outcome = "full" | "partial" | "incorrect" | "unanswered" | "unmarked";

export interface QuestionOutcome {
  question: PaperQuestion;
  outcome: Outcome;
  awarded: number;
  lost: number;
  answer: string;
  result: QuestionResult | null;
}

export interface ChapterScore {
  name: string;
  scored: number;
  possible: number;
  questions: number;
}

export interface LostMarks {
  number: number;
  questionId: string;
  chapter: string | null;
  lost: number;
  marks: number;
  outcome: Outcome;
  /** One line on why: the first missed points, the correct option, or "not attempted". */
  reason: string;
}

export interface PaperAnalysis {
  score: number;
  outOf: number;
  percent: number;
  counts: Record<Outcome, number>;
  outcomes: QuestionOutcome[];
  chapters: ChapterScore[];
  leftBehind: LostMarks[];
  summary: string[];
  minutesTaken: number | null;
}

export function fmtMarks(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${fmtMarks(n)} ${n === 1 ? one : many}`;
}

function outcomeOf(q: PaperQuestion, paper: Paper): QuestionOutcome {
  const a = paper.answers[q.id];
  const answer = a?.text ?? "";
  const result = paper.results[q.id] ?? null;
  if (a?.markState === "failed") return { question: q, outcome: "unmarked", awarded: 0, lost: 0, answer, result: null };
  if (!result || !answer.trim()) {
    return { question: q, outcome: "unanswered", awarded: 0, lost: q.marks, answer, result: null };
  }
  const awarded = Math.min(result.awarded, q.marks);
  const outcome: Outcome = awarded >= q.marks ? "full" : awarded > 0 ? "partial" : "incorrect";
  return { question: q, outcome, awarded, lost: Math.max(0, q.marks - awarded), answer, result };
}

function reasonFor(o: QuestionOutcome): string {
  if (o.outcome === "unanswered") return "Not attempted.";
  const r = o.result!;
  if (o.question.type === "objective") {
    return r.modelAnswer ? `Correct answer: ${r.modelAnswer}` : "Incorrect option.";
  }
  const missed = r.markingPoints.filter((p) => p.status !== "awarded").map((p) => p.point.trim());
  if (r.conceptualErrors.length) return r.conceptualErrors[0];
  if (missed.length) {
    const shown = missed.slice(0, 2).join("; ");
    return missed.length > 2 ? `Missed: ${shown}; and ${missed.length - 2} more.` : `Missed: ${shown}`;
  }
  return r.examinerFeedback ?? "Some scheme points were not covered.";
}

export function analysePaper(paper: Paper): PaperAnalysis {
  const outcomes = paper.questions.map((q) => outcomeOf(q, paper));
  const counts: Record<Outcome, number> = { full: 0, partial: 0, incorrect: 0, unanswered: 0, unmarked: 0 };
  for (const o of outcomes) counts[o.outcome] += 1;

  const scored = outcomes.filter((o) => o.outcome !== "unmarked");
  const score = scored.reduce((s, o) => s + o.awarded, 0);
  const outOf = scored.reduce((s, o) => s + o.question.marks, 0);
  const percent = outOf ? Math.round((score / outOf) * 100) : 0;

  const chapterMap = new Map<string, ChapterScore>();
  for (const o of scored) {
    const name = o.question.chapter ?? "Other";
    const c = chapterMap.get(name) ?? { name, scored: 0, possible: 0, questions: 0 };
    c.scored += o.awarded;
    c.possible += o.question.marks;
    c.questions += 1;
    chapterMap.set(name, c);
  }
  const chapters = [...chapterMap.values()].sort(
    (a, b) => a.scored / a.possible - b.scored / b.possible || b.possible - a.possible,
  );

  const leftBehind: LostMarks[] = outcomes
    .filter((o) => o.lost > 0)
    .sort((a, b) => b.lost - a.lost || a.question.number - b.question.number)
    .map((o) => ({
      number: o.question.number,
      questionId: o.question.id,
      chapter: o.question.chapter,
      lost: o.lost,
      marks: o.question.marks,
      outcome: o.outcome,
      reason: reasonFor(o),
    }));

  const minutesTaken =
    paper.startedAt && paper.submittedAt
      ? Math.max(1, Math.round((Date.parse(paper.submittedAt) - Date.parse(paper.startedAt)) / 60_000))
      : null;

  return {
    score,
    outOf,
    percent,
    counts,
    outcomes,
    chapters,
    leftBehind,
    summary: examinerSummary({ score, outOf, percent, counts, outcomes, chapters }),
    minutesTaken,
  };
}

// ─── Examiner summary ────────────────────────────────────────────────────────

function examinerSummary({
  score,
  outOf,
  percent,
  counts,
  outcomes,
  chapters,
}: Pick<PaperAnalysis, "score" | "outOf" | "percent" | "counts" | "outcomes" | "chapters">): string[] {
  const lines: string[] = [];
  if (!outOf) return ["None of the answers on this paper could be marked."];

  const band =
    percent >= 90
      ? "an excellent result"
      : percent >= 75
        ? "a strong result"
        : percent >= 50
          ? "a solid base to build on"
          : "a clear picture of what to work on next";
  lines.push(`You scored ${fmtMarks(score)} out of ${fmtMarks(outOf)} (${percent}%), ${band}.`);

  if (score === outOf) {
    lines.push("Every answer met the marking scheme in full. A harder paper, or a new set of chapters, is the next step.");
    return lines;
  }

  // Where the lost marks went, by kind, so the advice matches the cause.
  const lost = { blank: { marks: 0, n: 0 }, objective: { marks: 0, n: 0 }, concept: { marks: 0, n: 0 }, points: { marks: 0, n: 0 } };
  for (const o of outcomes) {
    if (o.lost <= 0) continue;
    const bucket =
      o.outcome === "unanswered"
        ? lost.blank
        : o.question.type === "objective"
          ? lost.objective
          : o.result?.conceptualErrors.length
            ? lost.concept
            : lost.points;
    bucket.marks += o.lost;
    bucket.n += 1;
  }
  const ranked = (Object.entries(lost) as [keyof typeof lost, { marks: number; n: number }][])
    .filter(([, v]) => v.marks > 0)
    .sort((a, b) => b[1].marks - a[1].marks);

  for (const [kind, v] of ranked.slice(0, 2)) {
    const first = kind === ranked[0][0];
    const lead = first ? "Most of the marks you lost" : "You also lost";
    if (kind === "blank") {
      lines.push(
        `${first ? `${lead} came from` : `${lead} ${plural(v.marks, "mark")} on`} ${plural(v.n, "question")} left blank${
          first ? ` (${plural(v.marks, "mark")})` : ""
        }. Attempting every question, even partly, is the quickest gain available: written answers earn marks point by point.`,
      );
    } else if (kind === "points") {
      lines.push(
        `${first ? `${lead} came from` : `${lead} ${plural(v.marks, "mark")} on`} written ${
          v.n === 1 ? "answer" : "answers"
        } that were on the right lines but left out points the scheme rewards${
          first ? ` (${plural(v.marks, "mark")} across ${plural(v.n, "answer")})` : ""
        }. Examiners mark point by point, so a complete answer matters as much as a correct one.`,
      );
    } else if (kind === "concept") {
      lines.push(
        `${plural(v.n, "answer")} showed a conceptual error, costing ${plural(v.marks, "mark")}. Revisit those ideas before practising more questions on them; the expanded answers below say exactly what went wrong.`,
      );
    } else {
      lines.push(
        `The objective section cost ${plural(v.marks, "mark")} across ${plural(v.n, "question")}. These are recall questions, so a quick revision of the chapters below should win them back.`,
      );
    }
  }

  const rated = chapters.filter((c) => c.possible >= 2);
  if (rated.length >= 2) {
    const weakest = rated[0];
    const strongest = rated[rated.length - 1];
    if (strongest.scored / strongest.possible > weakest.scored / weakest.possible) {
      lines.push(
        `Your strongest chapter was ${strongest.name} (${fmtMarks(strongest.scored)}/${fmtMarks(strongest.possible)}); ${weakest.name} (${fmtMarks(weakest.scored)}/${fmtMarks(weakest.possible)}) needs the most attention.`,
      );
    }
  }

  if (counts.unmarked) {
    lines.push(
      counts.unmarked === 1
        ? "One answer couldn’t be marked. It is left out of your total, and its credit was returned."
        : `${counts.unmarked} answers couldn’t be marked. They are left out of your total, and their credits were returned.`,
    );
  }
  return lines;
}
