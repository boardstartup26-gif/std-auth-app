// src/lib/notifications/reattempt-copy.ts
//
// Wording and links shared by the in-app prompt (./reattempt) and its email
// (./reattempt-email). Kept apart so neither module has to import the other.

export interface PromptSubject {
  subject: string;
  year: number | null;
  questionNumber: string;
  questionId: string;
}

export function formatMarks(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

export function questionLabel(c: Pick<PromptSubject, "subject" | "year" | "questionNumber">): string {
  return `${c.subject}${c.year ? ` ${c.year}` : ""} · Q${c.questionNumber}`;
}

export function reattemptHref(c: Pick<PromptSubject, "subject" | "questionId">): string {
  return `/evaluate?subject=${encodeURIComponent(c.subject)}&q=${encodeURIComponent(c.questionId)}`;
}
