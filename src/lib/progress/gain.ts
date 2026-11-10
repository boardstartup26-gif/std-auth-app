// src/lib/progress/gain.ts
//
// Reattempt Gain: marks won back by trying a question again. Pure.
//
// Written (examiner-graded) questions only, the same rule as the reattempt
// prompts in lib/notifications/reattempt.ts: once an MCQ's answer has been
// shown, choosing it again measures memory of the reveal, not improvement.
//
// Definitions, chosen so the figures always reconcile:
//   - gain for a question   = best later attempt − first attempt, floored at 0
//   - a recovery event      = a later attempt that beats every attempt before
//                             it, worth (new best − previous best)
//   - per question, the recovery events sum to exactly its gain, so the
//     streak (built on events) and the headline total (built on gains) can
//     never disagree.
// A worse later attempt doesn't subtract: the student showed they can score
// the higher mark, and "recovered" is about what they've shown they can do.

import { groupByQuestion, roundMarks } from "./attempts";
import type { ProgressAttempt } from "./types";

export interface QuestionGain {
  questionId: string;
  subject: string;
  chapter: string | null;
  questionNumber: string;
  year: number | null;
  total: number;
  first: number;
  best: number;
  latest: number;
  attempts: number;
  gain: number;
}

export interface RecoveryEvent {
  questionId: string;
  answerId: string;
  at: string;
  marks: number;
}

export interface ReattemptGain {
  /** Written questions attempted more than once, biggest gain first. */
  questions: QuestionGain[];
  reattempted: number;
  improved: number;
  marksRecovered: number;
  /** Oldest first. */
  recoveries: RecoveryEvent[];
}

export function computeReattemptGain(attempts: ProgressAttempt[]): ReattemptGain {
  const questions: QuestionGain[] = [];
  const recoveries: RecoveryEvent[] = [];

  for (const list of groupByQuestion(attempts.filter((a) => a.written)).values()) {
    if (list.length < 2) continue;
    const first = list[0];
    let best = first.awarded;
    for (const a of list.slice(1)) {
      if (a.awarded > best) {
        recoveries.push({ questionId: a.questionId, answerId: a.answerId, at: a.submittedAt, marks: roundMarks(a.awarded - best) });
        best = a.awarded;
      }
    }
    const head = list[list.length - 1];
    questions.push({
      questionId: first.questionId,
      subject: head.subject,
      chapter: head.chapter,
      questionNumber: head.questionNumber,
      year: head.year,
      total: head.total,
      first: first.awarded,
      best,
      latest: head.awarded,
      attempts: list.length,
      gain: roundMarks(best - first.awarded),
    });
  }

  questions.sort((a, b) => b.gain - a.gain || b.total - b.best - (a.total - a.best));
  recoveries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  return {
    questions,
    reattempted: questions.length,
    improved: questions.filter((q) => q.gain > 0).length,
    marksRecovered: roundMarks(questions.reduce((s, q) => s + q.gain, 0)),
    recoveries,
  };
}
