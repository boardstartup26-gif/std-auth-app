// Turns one evaluation response into what the feedback view shows. Pure: no
// React, no fetch, no model call — everything here is derived from fields the
// evaluate API already returns, so the view can't claim anything the marking
// didn't find.
//
// Each response field has exactly one home, so nothing is said twice:
//   marks, examiner_feedback        → summary
//   marking_points (awarded)        → Strengths
//   marking_points (missed/partial) → "Why you lost marks" rows, with deductions
//   conceptual_errors, icse_style_issues, unassessable_components → Gaps
//   improvement_tips                → Next correction (+ the last one as Examiner tip)
//   model_answer                    → Model answer, with computed highlights
//
// What is computed rather than returned by the API is lexical only: which
// model-answer sentence covers a lost point, and which model-answer terms come
// from lost points and are absent from the student's own answer. Both are
// shown as quotes/highlights of existing text, never as new feedback.

export interface FeedbackMarkingPoint {
  point: string;
  marks: number;
  status: "awarded" | "partial" | "missed";
  marks_awarded: number;
  matched_text: string | null;
}

/** The subset of the evaluate response this view reads. Optional = may be absent. */
export interface FeedbackSource {
  marks_awarded: number;
  total_marks: number;
  marking_points?: FeedbackMarkingPoint[];
  points_hit?: string[];
  points_missed?: string[];
  conceptual_errors?: string[];
  icse_style_issues?: string[];
  unassessable_components?: string[];
  model_answer?: string;
  model_answer_source?: "verified" | "ai_generated";
  examiner_feedback?: string;
  improvement_tips?: string[];
  is_objective?: boolean;
  is_correct?: boolean;
  correct_answer?: string;
}

export type ScoreBand = "full" | "strong" | "partial" | "low" | "zero";

export interface LostRow {
  key: string;
  point: string;
  status: "missed" | "partial";
  /** Marks deducted on this point; null on legacy rows that carry no per-point marks. */
  lost: number | null;
  got: number | null;
  of: number | null;
  /** The student's own words the examiner matched to a partly-made point. */
  quote: string | null;
  /** The model-answer sentence that covers this point, when one clearly does. */
  modelExcerpt: string | null;
}

export interface GapItem {
  kind: "conceptual" | "style" | "unassessable";
  text: string;
}

export interface ModelSegment {
  text: string;
  mark: boolean;
}

export interface FeedbackView {
  band: ScoreBand;
  verdict: string;
  counts: { awarded: number; partial: number; missed: number };
  strengths: string[];
  gaps: GapItem[];
  lostRows: LostRow[];
  nextCorrections: string[];
  examinerTip: string | null;
  modelSegments: ModelSegment[];
  hasHighlights: boolean;
}

// ─── Text matching ───────────────────────────────────────────────────────────

const STOPWORDS = new Set(
  (
    "a an and are as at be been being but by can could did do does for from had has have having he her his i if in into is it its " +
    "may might more most must no nor not of on one only or other our out over own same she should so some such than that the their " +
    "them then there these they this those through to too under up very was we were what when where which while who whom why will " +
    "with would you your also any both each few how all about above after again against because before below between during further " +
    "here just once until get gets got give gives given make makes made use used using due per via etc thus hence called known form " +
    "forms formed take takes taken become becomes " +
    // Marking-scheme verbs: how a point is phrased, not what it is about.
    "state states stated name names named identify identifies identified mention mentions mentioned describe describes described " +
    "explain explains explained define defines defined write writes written show shows shown correct correctly answer point points"
  ).split(" "),
);

/** Lowercased, lightly stemmed so "oxidised"/"oxidises" and "salts"/"salt" meet. */
function stem(word: string): string {
  const w = word.toLowerCase();
  if (w.length <= 4) return w;
  return w.replace(/(ations?|ising|izing|ised|ized|ises|izes|ing|ed|es|s)$/u, "");
}

function words(text: string): string[] {
  return text.match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Distinct content stems: no stopwords, nothing shorter than two characters. */
function contentStems(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of words(text)) {
    const lower = w.toLowerCase();
    if (lower.length < 2 || STOPWORDS.has(lower)) continue;
    out.add(stem(lower));
  }
  return out;
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+|\n+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The model-answer sentence that covers `point`, or null unless the overlap is
 * clear (at least half the point's content words, and two of them — one only
 * when the point has a single content word). A wrong sentence shown as "how a
 * full-mark answer covers it" would be worse than none.
 */
function excerptFor(point: string, modelSentences: { text: string; stems: Set<string> }[]): string | null {
  const want = contentStems(point);
  if (!want.size) return null;
  let best: { text: string; hits: number } | null = null;
  for (const s of modelSentences) {
    let hits = 0;
    for (const st of want) if (s.stems.has(st)) hits += 1;
    if (!best || hits > best.hits) best = { text: s.text, hits };
  }
  if (!best) return null;
  const needed = want.size === 1 ? 1 : 2;
  return best.hits >= needed && best.hits / want.size >= 0.5 ? best.text : null;
}

/**
 * Splits the model answer into plain and highlighted runs. A word is
 * highlighted when it comes from a marking point the student lost marks on
 * and does not appear in the student's own answer — the terms that were left
 * out. Adjacent highlighted words join into one phrase. Returns no highlights
 * when they would cover most of the answer (nothing was written, say): a
 * fully highlighted paragraph tells the student nothing.
 */
function highlightModel(model: string, lostPoints: string[], studentAnswer: string): ModelSegment[] {
  if (!model) return [];
  const plain: ModelSegment[] = [{ text: model, mark: false }];
  if (!lostPoints.length) return plain;

  const target = new Set<string>();
  for (const p of lostPoints) for (const st of contentStems(p)) target.add(st);
  for (const st of contentStems(studentAnswer)) target.delete(st);
  if (!target.size) return plain;

  const tokens = model.split(/([\p{L}\p{N}]+)/u); // odd indexes are words
  const marked = tokens.map((t, i) => {
    if (i % 2 === 0) return false;
    const lower = t.toLowerCase();
    return lower.length >= 2 && !STOPWORDS.has(lower) && target.has(stem(lower));
  });

  // A single linking word between two highlighted words joins the phrase
  // ("heating under reflux"), so it reads as one thing to add.
  const isGap = (t: string | undefined) => t !== undefined && /^[\s-]+$/u.test(t);
  for (let i = 3; i < tokens.length - 2; i += 2) {
    if (!marked[i] && marked[i - 2] && marked[i + 2] && STOPWORDS.has(tokens[i].toLowerCase()) && isGap(tokens[i - 1]) && isGap(tokens[i + 1])) {
      marked[i] = true;
    }
  }

  const contentWords = tokens.filter((t, i) => i % 2 === 1 && !STOPWORDS.has(t.toLowerCase())).length;
  const hits = marked.filter(Boolean).length;
  if (!hits || (contentWords > 0 && hits / contentWords > 0.5)) return plain;

  // Bridge the gap between two highlighted words when only whitespace (or a
  // hyphen) separates them, so "under reflux" reads as one phrase.
  const segments: ModelSegment[] = [];
  const push = (text: string, mark: boolean) => {
    if (!text) return;
    const last = segments[segments.length - 1];
    if (last && last.mark === mark) last.text += text;
    else segments.push({ text, mark });
  };
  for (let i = 0; i < tokens.length; i += 1) {
    if (i % 2 === 1) {
      push(tokens[i], marked[i]);
    } else {
      const bridge = /^[\s-]+$/u.test(tokens[i]) && marked[i - 1] === true && marked[i + 1] === true;
      push(tokens[i], bridge);
    }
  }
  return segments;
}

// ─── Verdict ─────────────────────────────────────────────────────────────────
// A headline chosen by score band and by what kind of marks were lost. It is
// a fixed sentence per case, not a model's opinion; the examiner's own words
// (examiner_feedback) sit directly beneath it.

function bandOf(awarded: number, total: number): ScoreBand {
  if (total <= 0) return awarded > 0 ? "strong" : "zero";
  if (awarded >= total) return "full";
  if (awarded <= 0) return "zero";
  const ratio = awarded / total;
  if (ratio >= 0.7) return "strong";
  if (ratio >= 0.4) return "partial";
  return "low";
}

function verdictFor(src: FeedbackSource, band: ScoreBand, counts: FeedbackView["counts"]): string {
  if (src.is_objective) return src.is_correct ? "Correct — full marks." : "Not the answer the key expects.";
  switch (band) {
    case "full":
      return "Full marks — every marking point landed.";
    case "strong":
      return counts.missed === 0 && counts.partial > 0
        ? "A strong answer — the points are there, not all made in full."
        : "A strong answer, with marks still to pick up.";
    case "partial":
      return counts.missed === 0 && counts.partial > 0
        ? "The right points, but not made fully enough."
        : "You have part of it, but marking points are missing.";
    case "low":
      return "A start, but most of the marks were missed.";
    default:
      return "No marks this time — here is what the scheme wanted.";
  }
}

// ─── View ────────────────────────────────────────────────────────────────────

const clean = (list: string[] | undefined): string[] => (list ?? []).map((s) => s?.trim()).filter(Boolean) as string[];

export function buildFeedbackView(src: FeedbackSource, studentAnswer: string): FeedbackView {
  const points = (src.marking_points ?? []).filter((p) => p.point?.trim());
  const structured = points.length > 0;
  const model = src.model_answer?.trim() ?? "";
  const modelSentences = sentences(model).map((text) => ({ text, stems: contentStems(text) }));

  const awarded = structured ? points.filter((p) => p.status === "awarded") : [];
  const lost = structured ? points.filter((p) => p.status !== "awarded") : [];

  const strengths = structured ? awarded.map((p) => p.point.trim()) : clean(src.points_hit);

  const lostRows: LostRow[] = structured
    ? lost.map((p, i) => {
        const partial = p.status === "partial";
        // A "partial" point keeps what it earned; a "missed" one loses it all.
        const got = partial ? Math.max(0, Math.min(p.marks_awarded, p.marks)) : 0;
        return {
          key: `p${i}`,
          point: p.point.trim(),
          status: partial ? "partial" : "missed",
          lost: Math.max(0, p.marks - got),
          got,
          of: p.marks,
          quote: partial && p.matched_text?.trim() ? p.matched_text.trim() : null,
          modelExcerpt: src.is_objective ? null : excerptFor(p.point, modelSentences),
        };
      })
    : clean(src.points_missed).map((point, i) => ({
        // Evaluations stored before marking_points carry no per-point marks:
        // the row shows the point, and no deduction is invented for it.
        key: `m${i}`,
        point,
        status: "missed" as const,
        lost: null,
        got: null,
        of: null,
        quote: null,
        modelExcerpt: excerptFor(point, modelSentences),
      }));

  const counts = {
    awarded: strengths.length,
    partial: lostRows.filter((r) => r.status === "partial").length,
    missed: lostRows.filter((r) => r.status === "missed").length,
  };
  const band = bandOf(src.marks_awarded, src.total_marks);

  const gaps: GapItem[] = [
    ...clean(src.conceptual_errors).map((text) => ({ kind: "conceptual" as const, text })),
    ...clean(src.icse_style_issues).map((text) => ({ kind: "style" as const, text })),
    ...clean(src.unassessable_components).map((text) => ({ kind: "unassessable" as const, text })),
  ];

  // The examiner prompt asks for 2–3 tips, ordered. With two or more, the
  // last becomes the Examiner tip and the rest are the corrections, so no tip
  // appears twice. With one, it stays a correction and there is no tip strip.
  const tips = clean(src.improvement_tips);
  const examinerTip = tips.length >= 2 ? tips[tips.length - 1] : null;
  const nextCorrections = examinerTip ? tips.slice(0, -1) : tips;

  const modelSegments = src.is_objective
    ? []
    : highlightModel(
        model,
        lostRows.map((r) => r.point),
        studentAnswer,
      );

  return {
    band,
    verdict: verdictFor(src, band, counts),
    counts,
    strengths,
    gaps,
    lostRows,
    nextCorrections,
    examinerTip,
    modelSegments,
    hasHighlights: modelSegments.some((s) => s.mark),
  };
}

/** Marks without a trailing ".0", and halves kept ("2", "1.5"). */
export function formatMarks(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}
