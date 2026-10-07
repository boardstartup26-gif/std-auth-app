// src/lib/practice-sets/build.ts
//
// Builds a practice paper from real past-paper questions. Never generates a
// question: every item is a stored PYQ with its official CISCE scheme, which
// is the whole point (see .agents/product-marketing.md §11b).
//
// A question is eligible only if /evaluate can actually mark it: it has text,
// a positive mark value, and isn't a drawing or a question whose figure is
// missing (the same rules as diagramState() in evaluate/_lib/question.ts and
// the refusals in /api/evaluate — keep them in step).
//
// Server-only.

import { createAdminClient } from "@/lib/supabase/server";
import { isSubjectiveGraded } from "@/lib/question-format";
import {
  DIFFICULTIES,
  DIFFICULTY_MIN_COVERAGE,
  matchesDifficulty,
  SET_TYPES,
  type SetSpec,
  type SetType,
  type SubjectAvailability,
} from "./constants";

const PAGE_SIZE = 1000;

export interface PoolQuestion {
  id: string;
  subject: string;
  type: SetType;
  marks: number;
  chapter: string | null;
  year: number | null;
  difficulty: "easy" | "medium" | "hard" | null;
}

interface QuestionRow {
  id: string;
  question_text: string | null;
  is_subjective: boolean;
  question_type: string | null;
  year: number | null;
  chapter: string | null;
  diagram_required: boolean | null;
  diagram_url: string | null;
  diagram_source: string | null;
  difficulty_estimate: "easy" | "medium" | "hard" | null;
  subjects: { name: string } | null;
  question_marks: { total_marks: number | string | null }[] | { total_marks: number | string | null } | null;
}

type ClassifyFields = Pick<
  QuestionRow,
  "question_text" | "is_subjective" | "question_type" | "diagram_required" | "diagram_url" | "diagram_source" | "question_marks"
>;

function marksOf(row: ClassifyFields): number {
  const qm = Array.isArray(row.question_marks) ? row.question_marks[0] : row.question_marks;
  return Number(qm?.total_marks ?? 0);
}

/** Which section of a paper a question belongs in, or null if it can't be marked. */
export function classify(row: ClassifyFields): SetType | null {
  if (!row.question_text?.trim()) return null;
  if (row.diagram_source === "ocr_pending" || row.question_type === "diagram") return null;
  if (row.diagram_required && !row.diagram_url && row.diagram_source !== "physical_map") return null;
  const marks = marksOf(row);
  if (!Number.isFinite(marks) || marks <= 0) return null;
  if (!isSubjectiveGraded(row)) return "objective";
  if (marks <= 2) return "short";
  if (marks <= 5) return "long";
  return null; // whole 8/16-mark questions: not a single answer box
}

/** Every markable question, optionally for one subject. Paged past PostgREST's 1000-row cap. */
export async function loadPool(subject?: string): Promise<PoolQuestion[]> {
  const admin = createAdminClient();
  const pool: PoolQuestion[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = admin
      .from("questions")
      .select(
        "id, question_text, is_subjective, question_type, year, chapter, diagram_required, diagram_url, " +
          "diagram_source, difficulty_estimate, subjects!inner ( name ), question_marks ( total_marks )",
      )
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (subject) query = query.eq("subjects.name", subject);
    const { data, error } = await query;
    if (error) throw new Error(`question pool read failed: ${error.message}`);
    for (const row of (data ?? []) as unknown as QuestionRow[]) {
      const type = classify(row);
      if (!type || !row.subjects?.name) continue;
      pool.push({
        id: row.id,
        subject: row.subjects.name,
        type,
        marks: marksOf(row),
        chapter: row.chapter?.trim() || null,
        year: row.year,
        difficulty: row.difficulty_estimate,
      });
    }
    if (!data || data.length < PAGE_SIZE) return pool;
  }
}

export function summarise(pool: PoolQuestion[], subjects: readonly string[]): SubjectAvailability[] {
  return subjects.map((subject) => {
    const qs = pool.filter((q) => q.subject === subject);
    const zero = () => Object.fromEntries(SET_TYPES.map((t) => [t.key, 0])) as Record<SetType, number>;
    const available = Object.fromEntries(DIFFICULTIES.map((d) => [d, zero()])) as SubjectAvailability["available"];
    const chapters = new Map<string, number>();
    for (const q of qs) {
      for (const d of DIFFICULTIES) if (matchesDifficulty(d, q.difficulty)) available[d][q.type] += 1;
      if (q.chapter) chapters.set(q.chapter, (chapters.get(q.chapter) ?? 0) + 1);
    }
    const labelled = qs.filter((q) => q.difficulty).length;
    const avgMarks = zero();
    for (const t of SET_TYPES) {
      const ofType = qs.filter((q) => q.type === t.key);
      avgMarks[t.key] = ofType.length ? ofType.reduce((s, q) => s + q.marks, 0) / ofType.length : 0;
    }
    return {
      subject,
      available,
      chapters: [...chapters.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      difficultyLabelled: qs.length > 0 && labelled / qs.length >= DIFFICULTY_MIN_COVERAGE,
      avgMarks,
    };
  });
}

/** Question ids whose latest attempt by this student scored full marks. */
export async function masteredQuestionIds(userId: string): Promise<Set<string>> {
  const { data, error } = await createAdminClient()
    .from("student_answers")
    .select("question_id, submitted_at, evaluations ( marks_awarded ), questions ( question_marks ( total_marks ) )")
    .eq("user_id", userId)
    .order("submitted_at", { ascending: true });
  if (error) {
    console.warn("[BoardEdge] mastered-question read failed:", error.message);
    return new Set();
  }
  const latest = new Map<string, boolean>();
  for (const row of (data ?? []) as unknown as {
    question_id: string;
    evaluations: { marks_awarded: number | string | null }[] | null;
    questions: { question_marks: { total_marks: number | string | null }[] | { total_marks: number | string | null } | null } | null;
  }[]) {
    const ev = row.evaluations?.[0];
    const qm = row.questions?.question_marks;
    const total = Number((Array.isArray(qm) ? qm[0] : qm)?.total_marks ?? 0);
    if (!ev || total <= 0) continue;
    latest.set(row.question_id, Number(ev.marks_awarded ?? 0) >= total);
  }
  return new Set([...latest.entries()].filter(([, full]) => full).map(([id]) => id));
}

// ─── Selection ───────────────────────────────────────────────────────────────

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type BuildResult =
  | { ok: true; questions: PoolQuestion[]; totalMarks: number; exactFit: boolean }
  | { ok: false; message: string };

const SWAP_ATTEMPTS = 4000;

/**
 * Pure: picks the requested number of each type at random, then, if a marks
 * target was given, swaps questions within the same type to bring the total
 * as close to it as the pool allows. The counts per type are never changed to
 * hit a target: the student asked for them.
 */
export function selectQuestions(
  pool: PoolQuestion[],
  spec: SetSpec,
  { mastered = new Set<string>(), random = Math.random }: { mastered?: Set<string>; random?: () => number } = {},
): BuildResult {
  const chapters = new Set(spec.chapters);
  const eligible = pool.filter(
    (q) =>
      q.subject === spec.subject &&
      (chapters.size === 0 || (q.chapter !== null && chapters.has(q.chapter))) &&
      matchesDifficulty(spec.difficulty, q.difficulty) &&
      !(spec.skipMastered && mastered.has(q.id)),
  );

  const picked = new Map<SetType, PoolQuestion[]>();
  const spare = new Map<SetType, PoolQuestion[]>();
  const short: string[] = [];
  for (const { key, label } of SET_TYPES) {
    const want = spec.counts[key];
    const candidates = shuffle(eligible.filter((q) => q.type === key), random);
    if (candidates.length < want) short.push(`${label.toLowerCase()}: ${candidates.length} available, ${want} asked`);
    picked.set(key, candidates.slice(0, want));
    spare.set(key, candidates.slice(want));
  }
  if (short.length) {
    return {
      ok: false,
      message: `Not enough questions match those choices (${short.join("; ")}). Try fewer questions, more chapters, or any difficulty.`,
    };
  }

  const sum = () => [...picked.values()].flat().reduce((s, q) => s + q.marks, 0);
  let total = sum();

  if (spec.targetMarks !== null) {
    const target = spec.targetMarks;
    const swappable = SET_TYPES.map((t) => t.key).filter(
      (k) => (picked.get(k)?.length ?? 0) > 0 && (spare.get(k)?.length ?? 0) > 0,
    );
    for (let i = 0; i < SWAP_ATTEMPTS && total !== target && swappable.length; i += 1) {
      const type = swappable[Math.floor(random() * swappable.length)];
      const inSet = picked.get(type)!;
      const out = spare.get(type)!;
      const a = Math.floor(random() * inSet.length);
      const b = Math.floor(random() * out.length);
      const next = total - inSet[a].marks + out[b].marks;
      if (Math.abs(next - target) < Math.abs(total - target)) {
        [inSet[a], out[b]] = [out[b], inSet[a]];
        total = next;
      }
    }
  }

  // Paper order: objective section first, then short, then long, as on a
  // board paper. Within a section, older papers first.
  const questions = SET_TYPES.flatMap(({ key }) =>
    [...picked.get(key)!].sort((x, y) => (x.year ?? 0) - (y.year ?? 0)),
  );
  return {
    ok: true,
    questions,
    totalMarks: total,
    exactFit: spec.targetMarks === null || total === spec.targetMarks,
  };
}
