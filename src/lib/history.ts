// src/lib/history.ts
//
// Pure derivation logic for the History page. No React, no Supabase — the page
// does the fetching and hands rows in here, which keeps the grouping and
// summary rules readable and independently checkable.
//
// Written against what the `evaluations` table actually holds today, not
// against the shape the redesign assumes. Of 234 evaluation rows in
// production, 3 have a populated `marking_points[]` and 136 have the older
// flat `points_missed[]`. A loss summary that only understood marking_points
// would therefore be blank on ~98% of real history. Every derivation below
// prefers marking_points and falls back to points_missed.

export type MarkingPointStatus = "awarded" | "partial" | "missed";

export interface MarkingPoint {
  point: string;
  marks: number;
  status: MarkingPointStatus;
  marks_awarded: number;
  matched_text: string | null;
  anchor: { start: number; end: number } | null;
}

/** Only the evaluation fields the History page is allowed to derive from. */
export interface EvaluationFacts {
  marks_awarded: number | null;
  marking_points: MarkingPoint[] | null;
  points_missed: string[] | null;
  conceptual_errors: string[] | null;
}

export interface AttemptInput {
  id: string;
  submittedAt: string;
  questionId: string | null;
  questionNumber: string;
  questionText: string;
  year: number | null;
  subject: string;
  chapter: string | null;
  topic: string | null;
  questionType: string | null;
  totalMarks: number;
  evaluation: EvaluationFacts | null;
}

// ─── Loss summary ────────────────────────────────────────────────────────────

/**
 * Scheme points read like "Power to allocate portfolio and to reshuffle the
 * Council of Ministers" — accurate, but too long to sit on a card. Cut at the
 * first clause boundary, then at a word boundary, so the fragment stays
 * grammatical instead of ending mid-word.
 */
function condense(text: string, max = 42): string {
  const full = text.trim().replace(/\s+/g, " ");
  // Objective questions store the option label in the point itself — "(a)
  // Sulphur dioxide". Strip the label rather than treating it as content.
  let t = full.replace(/^\(\s*[A-Za-z0-9ivxIVX]{1,4}\s*\)\s*/, "");
  // A trailing aside — "(see scheme)", "(any two)" — is noise on a card.
  // Removed rather than split on: assertion-reason options are *made* of
  // parentheses ("(A) is true but (R) is false"), so splitting at the first
  // "(" amputated them.
  t = t.replace(/\s*\([^)]*\)\s*$/, "").trim();
  // First clause only. Both separators are deliberately space-anchored — an
  // unspaced "/" is a fraction in this corpus ("notice by 1/4th of the
  // members"), and splitting on it truncated to "notice by 1".
  const head = t.split(/\s+[–—]\s+|\s+\/\s+|[.;:]\s/)[0].trim();
  // Never let clause-splitting produce nothing: fall back to the whole point.
  t = isRealPoint(head) ? head : t.trim() || full;
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const kept = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return kept.replace(/[,\s]+$/, "") + "…";
}

/** Sentence-case fragments read wrong mid-list ("missed Leader of the cabinet"). */
function decapitalise(text: string): string {
  // Leave acronyms and obvious proper nouns alone — only lower a leading
  // capital when the rest of the first word is lowercase, which excludes
  // "ICSE" and "PM" and reduces (not eliminates) the chance of lowercasing
  // a name.
  const [first = "", ...rest] = text.split(" ");
  // A leading article is always safe to lower; "I" never is.
  if (first === "A" || first === "An" || first === "The") {
    return [first.toLowerCase(), ...rest].join(" ");
  }
  if (first.length > 1 && first === first[0] + first.slice(1).toLowerCase() && /[a-z]/.test(first[1])) {
    return [first[0].toLowerCase() + first.slice(1), ...rest].join(" ");
  }
  return text;
}

/**
 * Some scheme rows carry punctuation-only fragments — a bare "," survives in
 * production `points_missed` arrays and rendered as "Missed , +1 more".
 * Anything without a letter or digit in it is not a point.
 */
function isRealPoint(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text ?? "");
}

/**
 * One plain-English line describing what this attempt dropped. Strictly a
 * derivative — never the examiner feedback or the model answer, which stay
 * exclusive to the Results page.
 */
export function summariseLoss(evaluation: EvaluationFacts | null, totalMarks: number): string {
  if (!evaluation) return "Not evaluated.";

  const awarded = evaluation.marks_awarded ?? 0;
  const conceptual = (evaluation.conceptual_errors ?? []).filter(isRealPoint);

  // Prefer the structured shape; fall back to the flat list that almost every
  // real row still uses.
  const missedPoints: string[] =
    Array.isArray(evaluation.marking_points) && evaluation.marking_points.length
      ? evaluation.marking_points.filter((p) => p?.status === "missed").map((p) => p.point)
      : evaluation.points_missed ?? [];

  const missed = missedPoints.filter(isRealPoint);

  if (!missed.length && !conceptual.length) {
    return totalMarks > 0 && awarded >= totalMarks
      ? "Full marks — nothing dropped."
      : "No specific points flagged.";
  }

  const parts: string[] = [];
  if (missed.length) {
    const shown = missed.slice(0, 2).map((m) => decapitalise(condense(m)));
    const extra = missed.length - shown.length;
    parts.push(`Missed ${shown.join(", ")}${extra > 0 ? ` +${extra} more` : ""}`);
  }
  if (conceptual.length) {
    // Conceptual errors are full paragraphs of reasoning — a count carries the
    // signal without dragging the card height around.
    parts.push(`${conceptual.length} conceptual error${conceptual.length > 1 ? "s" : ""}`);
  }
  return parts.join(" · ");
}

// ─── Grouping repeated attempts ──────────────────────────────────────────────

export interface HistoryAttempt {
  id: string;
  submittedAt: string;
  awarded: number;
  totalMarks: number;
  percent: number | null;
  lossSummary: string;
}

export interface HistoryGroup {
  key: string;
  subject: string;
  chapter: string | null;
  topic: string | null;
  questionType: string | null;
  questionNumber: string;
  year: number | null;
  questionText: string;
  attempts: HistoryAttempt[]; // oldest to newest, so the trail reads left to right
  latest: HistoryAttempt; // the attempt the collapsed card represents
  best: number | null;
  trend: "up" | "down" | "flat" | null;
}

function percentOf(awarded: number, total: number): number | null {
  return total > 0 ? Math.round((awarded / total) * 100) : null;
}

/**
 * Collapse repeated attempts at the same question into one entry. Keyed by
 * question id where there is one; falling back to the subject/year/number
 * triple keeps rows with a null question from each becoming their own group.
 */
export function groupAttempts(rows: AttemptInput[]): HistoryGroup[] {
  const groups = new Map<string, AttemptInput[]>();
  for (const row of rows) {
    const key = row.questionId ?? `${row.subject}|${row.year}|${row.questionNumber}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  const out: HistoryGroup[] = [];
  for (const [key, bucket] of groups) {
    const ordered = [...bucket].sort(
      (a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt)
    );
    const attempts: HistoryAttempt[] = ordered.map((r) => {
      const awarded = r.evaluation?.marks_awarded ?? 0;
      return {
        id: r.id,
        submittedAt: r.submittedAt,
        awarded,
        totalMarks: r.totalMarks,
        percent: percentOf(awarded, r.totalMarks),
        lossSummary: summariseLoss(r.evaluation, r.totalMarks),
      };
    });

    const head = ordered[ordered.length - 1];
    const latest = attempts[attempts.length - 1];
    const percents = attempts.map((a) => a.percent).filter((p): p is number => p !== null);

    let trend: HistoryGroup["trend"] = null;
    if (attempts.length > 1 && percents.length > 1) {
      const delta = percents[percents.length - 1] - percents[0];
      trend = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    }

    out.push({
      key,
      subject: head.subject,
      chapter: head.chapter,
      topic: head.topic,
      questionType: head.questionType,
      questionNumber: head.questionNumber,
      year: head.year,
      questionText: head.questionText,
      attempts,
      latest,
      best: percents.length ? Math.max(...percents) : null,
      trend,
    });
  }

  return out.sort((a, b) => Date.parse(b.latest.submittedAt) - Date.parse(a.latest.submittedAt));
}

// ─── Header stats ────────────────────────────────────────────────────────────

export interface HistoryStats {
  evaluated: number;
  averagePercent: number | null;
  topSubject: { name: string; count: number } | null;
  trend: { deltaPoints: number; sampleSize: number } | null;
}

export function computeStats(rows: AttemptInput[]): HistoryStats {
  const scored = rows
    .filter((r) => r.evaluation && r.totalMarks > 0)
    .map((r) => ({
      at: Date.parse(r.submittedAt),
      subject: r.subject,
      percent: ((r.evaluation?.marks_awarded ?? 0) / r.totalMarks) * 100,
    }));

  const averagePercent = scored.length
    ? Math.round(scored.reduce((s, r) => s + r.percent, 0) / scored.length)
    : null;

  const bySubject = new Map<string, number>();
  for (const r of rows) bySubject.set(r.subject, (bySubject.get(r.subject) ?? 0) + 1);
  const top = [...bySubject.entries()].sort((a, b) => b[1] - a[1])[0];

  // Trend compares the most recent block of attempts against the block before
  // it. Both blocks must be the same size or the comparison is meaningless,
  // and below 4 scored attempts there is no block worth comparing — a null
  // here renders as "Not enough data yet", never as 0%.
  let trend: HistoryStats["trend"] = null;
  const chronological = [...scored].sort((a, b) => a.at - b.at);
  if (chronological.length >= 4) {
    const block = Math.min(5, Math.floor(chronological.length / 2));
    const recent = chronological.slice(-block);
    const prior = chronological.slice(-block * 2, -block);
    const mean = (xs: typeof recent) => xs.reduce((s, r) => s + r.percent, 0) / xs.length;
    trend = { deltaPoints: Math.round(mean(recent) - mean(prior)), sampleSize: block };
  }

  return {
    evaluated: rows.length,
    averagePercent,
    topSubject: top ? { name: top[0], count: top[1] } : null,
    trend,
  };
}
