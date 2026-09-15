// The question shape as /evaluate reads it, plus the small pure helpers that
// both the picker and the answer view need. Lifted out of page.tsx when the
// selection funnel became its own component — two copies of this type drifting
// apart is exactly how the diagram_required bug happened the first time.

// Two import batches shaped MCQ options differently: chemistry/physics/
// biology/geography store plain option strings; history & civics / english
// literature store {key, text} objects (their correct_answer is the bare
// key letter). Both shapes have to render and submit correctly.
export type McqOption = string | { key: string; text: string };

// Extract/stimulus/table shapes populated only for History & Civics / English
// Literature rows (the same import batches that gave those two subjects their
// {key, text} MCQ options above) — every field is optional because the shape
// varies by stimulus type and not every row carrying one populates all of it.
export interface ExtractData {
  text?: string | null;
  speaker?: string | null;
  reference?: string | null;
  context_before?: string | null;
}

export interface LiteraryWorkData {
  title?: string | null;
  author?: string | null;
  work_type?: string | null;
}

// Only stimulus.type === "passage" renders — a picture stimulus is a diagram
// like any other subject's and goes through diagram_url instead.
export interface StimulusData {
  type?: string | null;
  text?: string | null;
  source?: string | null;
}

export interface TableData {
  headers?: string[];
  rows?: string[][];
}

// Why a question is diagram-related. Set by scripts/sync_diagram_figures.mjs;
// see the migration that adds questions.diagram_source for the full contract.
export type DiagramSource = "figure" | "physical_map" | "ocr_pending" | null;

export interface Question {
  id: string;
  question_number: string;
  question_text: string;
  is_subjective: boolean;
  question_type: string | null;
  options: McqOption[] | null;
  paper: string;
  year: number;
  chapter: string | null;
  diagram_required: boolean | null;
  diagram_url: string | null;
  diagram_source: DiagramSource;
  topic: string | null;
  extract: ExtractData | null;
  stimulus: StimulusData | null;
  literary_work: LiteraryWorkData | null;
  table_data: TableData | null;
  // Marks come from the question_marks view, not marking_schemes directly —
  // that table now only opens to a student who has already attempted the
  // question, so the answer key can't be read ahead of time. The view carries
  // total_marks and nothing else. Supabase types an embedded relation as an
  // array even where it is 1:1, hence the union.
  question_marks: { total_marks: number | null }[] | { total_marks: number | null } | null;
}

// One list, used by the single query in page.tsx. diagram_required was once
// missing here, which left selectedQuestion.diagram_required undefined and the
// diagram-blocking UI silently dead — hence the single named constant.
export const QUESTION_SELECT =
  "id, question_number, question_text, is_subjective, question_type, options, paper, year, " +
  "chapter, diagram_required, diagram_url, diagram_source, topic, extract, stimulus, " +
  "literary_work, table_data, question_marks(total_marks)";

export const SUBJECTS = [
  "Chemistry",
  "Physics",
  "Biology",
  "Geography",
  "History & Civics",
  "English Literature",
] as const;

// Sentinel bucket for questions with no chapter/topic value — coverage varies
// by subject as the chapter backfill (scripts/backfill_*.mjs) fills in over
// time. Keeping it a distinct value rather than "" lets it sit alongside real
// names in the same list instead of colliding with the "nothing chosen" state.
export const OTHER_BUCKET = "__other__";

// The submitted value must match how correct_answer is stored for that
// question: full option text for chemistry/physics/biology/geography, bare
// key letter for history & civics/english literature.
export function mcqOptionValue(opt: McqOption): string {
  return typeof opt === "string" ? opt : opt.key;
}

export function mcqOptionLabel(opt: McqOption): string {
  return typeof opt === "string" ? opt : opt.text;
}

export function totalMarksOf(q: Question): number | null {
  const ms = q.question_marks;
  if (!ms) return null;
  const row = Array.isArray(ms) ? ms[0] : ms;
  return row?.total_marks ?? null;
}

// How a question's figure affects answering. Three of the four states are
// answerable — only a question asking the student to DRAW is truly blocked,
// plus the residue of questions whose figure hasn't been captured yet.
//
//   "ok"          nothing in the way (with or without a figure to display)
//   "map"         needs a Survey of India topographic sheet we can't ship
//   "ocr"         student must draw; blocked until handwriting recognition
//   "no-figure"   needs a figure that hasn't been sourced yet; blocked
export type DiagramState = "ok" | "map" | "ocr" | "no-figure";

export function diagramState(q: Question): DiagramState {
  // Drawing beats everything: even where a figure exists for context, the
  // answer itself is a drawing we can't grade yet.
  if (q.diagram_source === "ocr_pending" || q.question_type === "diagram") return "ocr";
  if (q.diagram_source === "physical_map") return "map";
  if (q.diagram_required && !q.diagram_url) return "no-figure";
  return "ok";
}

export function isDiagramBlocked(q: Question): boolean {
  const s = diagramState(q);
  return s === "ocr" || s === "no-figure";
}

// Is there a figure to be wrong about? A plain text question has nothing to
// report, so offering "Figure wrong or missing?" there is noise at best and
// invites junk reports at worst.
export function hasFigureContext(q: Question): boolean {
  return Boolean(q.diagram_url) || q.diagram_source !== null || Boolean(q.diagram_required);
}
