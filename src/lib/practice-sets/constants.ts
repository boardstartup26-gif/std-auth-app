// src/lib/practice-sets/constants.ts
//
// Client-safe vocabulary for practice papers. The builder form, the server
// action and the selection logic all read these, so a type or limit can't
// drift between what the form offers and what the server accepts.

export const SET_TYPES = [
  {
    key: "objective",
    label: "Objective",
    hint: "MCQs, fill in the blanks, match the following. Free to mark.",
    max: 15,
  },
  { key: "short", label: "Short answer", hint: "Written answers worth 1–2 marks.", max: 12 },
  { key: "long", label: "Long answer", hint: "Written answers worth 3–5 marks.", max: 8 },
] as const;

export type SetType = (typeof SET_TYPES)[number]["key"];

/**
 * What the student chooses. The stored estimate has three levels, but only
 * ~1% of questions came out "hard" (most ICSE questions are short recall), so
 * a "Hard" option would almost always come back empty. Students get two
 * honest bands instead: easier = "easy", harder = "medium" or "hard".
 */
export const DIFFICULTIES = ["any", "easier", "harder"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export type DifficultyEstimate = "easy" | "medium" | "hard";

export function matchesDifficulty(choice: Difficulty, estimate: DifficultyEstimate | null): boolean {
  if (choice === "any") return true;
  if (!estimate) return false;
  return choice === "easier" ? estimate === "easy" : estimate !== "easy";
}

export const MAX_QUESTIONS = 25;
export const MAX_TARGET_MARKS = 80;

/**
 * Below this share of labelled questions in a subject, the difficulty filter
 * is not offered: filtering would silently draw only from the labelled few.
 */
export const DIFFICULTY_MIN_COVERAGE = 0.9;

/**
 * Paper length. Quick and Standard are fixed recipes (trimmed to what the
 * subject can supply); Custom exposes the per-section counts and a marks target.
 */
export const LENGTHS = ["quick", "standard", "custom"] as const;
export type PaperLength = (typeof LENGTHS)[number];

export const LENGTH_PRESETS: Record<Exclude<PaperLength, "custom">, Record<SetType, number>> = {
  quick: { objective: 5, short: 3, long: 1 },
  standard: { objective: 10, short: 6, long: 4 },
};

/**
 * A preset's counts, fitted to what a subject can supply. A section that runs
 * short is made up in the other written section, roughly mark for mark (one
 * long answer ~ two short ones), so Biology (no long answers) and English
 * Literature (no short ones) still get a paper of about the intended weight.
 */
export function fitPreset(preset: Record<SetType, number>, cap: Record<SetType, number>): Record<SetType, number> {
  let short = preset.short;
  let long = preset.long;
  if (cap.long < long) {
    short += (long - cap.long) * 2;
    long = cap.long;
  }
  if (cap.short < short) {
    long = Math.min(cap.long, long + Math.ceil((short - cap.short) / 2));
    short = cap.short;
  }
  return {
    objective: Math.min(preset.objective, cap.objective),
    short: Math.min(short, cap.short, SET_TYPES[1].max),
    long: Math.min(long, cap.long, SET_TYPES[2].max),
  };
}

/** ICSE papers allow two hours for 80 marks: 1.5 minutes a mark. */
export const MINUTES_PER_MARK = 1.5;

export function approxMinutes(marks: number): number {
  return Math.max(5, Math.round((marks * MINUTES_PER_MARK) / 5) * 5);
}

export const PAPER_STATUSES = ["in_progress", "marking", "marked"] as const;
export type PaperStatus = (typeof PAPER_STATUSES)[number];

export interface SetSpec {
  subject: string;
  counts: Record<SetType, number>;
  /** null = no target; the paper totals whatever the chosen questions add up to. */
  targetMarks: number | null;
  difficulty: Difficulty;
  /** Empty = the whole syllabus. */
  chapters: string[];
  /** Leave out questions the student's latest attempt already scored full marks on. */
  skipMastered: boolean;
  /** Which length option produced the counts (absent on papers built before presets). */
  length?: PaperLength;
  /** Set when this paper is a retry of another paper's missed questions. */
  retryOf?: string;
}

/** Per-subject facts the builder needs to offer only what can be built. */
export interface SubjectAvailability {
  subject: string;
  /** Markable questions per type, at each difficulty ("any" = all of them). */
  available: Record<Difficulty, Record<SetType, number>>;
  chapters: { name: string; count: number }[];
  difficultyLabelled: boolean;
  /** Average marks of a question in each section, for the builder's marks/time estimate. */
  avgMarks: Record<SetType, number>;
}
