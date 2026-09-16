// The single real evaluation the landing page is built around (handoff §6).
//
// Act 1 shows this answer being written; Act 2 will mark it. Same record, one
// source — the narrative only works if the answer the visitor watches being
// written is the one they then watch being marked.
//
// Everything here is real: the extracted 2024 ICSE History & Civics question,
// the founder's own submitted answer, and the marks a real evaluation returned
// against it. Nothing is authored or synthesised, which is the whole point —
// a marketing page claiming examiner-grade marking should not be demonstrating
// it on invented data. It is the founder's own answer rather than a student's
// because a real student's submission is theirs, not ours to publish.
//
// Step 5 of the build order extends this file to the full EvaluationOutput
// contract (marking_points[], model_answer, examiner_feedback, improvement
// tips) and adds the validator. Until then it carries only what Act 1 needs,
// so the answer text has exactly one home rather than two that can drift.

export interface ShowcaseRecord {
  subject: string;
  board: string;
  year: number;
  questionNumber: string;
  questionText: string;
  studentAnswerText: string;
  totalMarks: number;
  marksAwarded: number;
}

export const SHOWCASE: ShowcaseRecord = {
  subject: "History & Civics",
  board: "ICSE",
  year: 2024,
  questionNumber: "4(i)",
  questionText:
    "Mention any three points to distinguish between the Council of Ministers and the Cabinet.",
  studentAnswerText:
    "The Council of Ministers is a larger body consisting of all categories of ministers, including Cabinet Ministers, Ministers of State and Deputy Ministers, whereas the Cabinet is a smaller group of senior ministers holding important portfolios. The Cabinet meets frequently to decide important government policies, while the entire Council of Ministers rarely meets as one body. The Cabinet advises the President directly, whereas the Council of Ministers does not advise the President.",
  totalMarks: 3,
  marksAwarded: 2,
};

/**
 * The answer split into the sentences Act 1 reveals one at a time.
 *
 * Split at the sentence boundary rather than stored as an array so the prose
 * above stays the single source of truth — and so the string handed to Act 2's
 * anchor resolution is byte-identical to the one Act 1 displays. Authoring two
 * copies is how `matched_text` and the rendered answer drift apart.
 */
export function showcaseSentences(): string[] {
  return SHOWCASE.studentAnswerText
    .split(/(?<=\.)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
