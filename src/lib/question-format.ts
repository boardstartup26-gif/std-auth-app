// Uniform "Answer Format" categories for the /evaluate question picker.
//
// The DB's question_type column has 9 overlapping values (mcq, fill_in_blank,
// true_false, match, short_answer, long_answer, diagram, subjective,
// objective) plus a separate is_subjective flag that don't map 1:1 onto each
// other. This is a presentation-layer mapping only — it does not change how
// a question is graded. Grading in src/app/api/evaluate/route.ts keys off
// is_subjective / question_type directly and is untouched by this file.

export type AnswerFormat =
  | "mcq"
  | "true_false"
  | "fill_in_blank"
  | "match"
  | "short_answer"
  | "long_answer"
  | "diagram";

export const ANSWER_FORMAT_LABELS: Record<AnswerFormat, string> = {
  mcq: "MCQ",
  true_false: "True / False",
  fill_in_blank: "Fill in the blank",
  match: "Match the following",
  short_answer: "Short answer",
  long_answer: "Long answer",
  diagram: "Diagram / drawing",
};

// Diagram-format questions can't be evaluated yet (handwriting recognition
// isn't built) — src/app/api/evaluate/route.ts hard-blocks them with a 400.
// Surfacing the format as disabled rather than hiding it avoids implying the
// question type doesn't exist at all.
export const DIAGRAM_FORMAT_DISABLED = true;

export function normalizeAnswerFormat(q: {
  question_type: string | null;
  is_subjective: boolean;
}): AnswerFormat {
  switch (q.question_type) {
    case "mcq":
    case "true_false":
    case "fill_in_blank":
    case "match":
    case "short_answer":
    case "long_answer":
    case "diagram":
      return q.question_type;
    case "subjective":
      return "long_answer";
    case "objective":
    default:
      return q.is_subjective ? "long_answer" : "short_answer";
  }
}

// Whether a question is graded by Claude vs. matched deterministically.
// Mirrors the exact formula in src/app/api/evaluate/route.ts — kept as its
// own helper (rather than derived from normalizeAnswerFormat) because it must
// match the server's real charge, and the two disagree on one known data
// anomaly: a few "match the following" rows are mistakenly flagged
// is_subjective: true in the source data, which the format bucket doesn't
// reflect (it still buckets them as "match", not "long_answer").
export function isSubjectiveGraded(q: {
  question_type: string | null;
  is_subjective: boolean;
}): boolean {
  return q.is_subjective || q.question_type === "short_answer";
}
