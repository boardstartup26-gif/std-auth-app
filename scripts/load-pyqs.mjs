/**
 * BoardEdge PYQ loader — English Literature + History & Civics.
 *
 * Reads the extracted marking-scheme JSON for a subject/year, validates every
 * question, then writes a `questions` row plus its paired `marking_schemes`
 * row. Idempotent: re-running replaces rather than duplicates.
 *
 *   node scripts/load-pyqs.mjs --subject english_literature --year 2025
 *   node scripts/load-pyqs.mjs --subject history_civics --year all
 *   node scripts/load-pyqs.mjs --subject all --year all --dry-run
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env.local") });

// ─── Configuration ────────────────────────────────────────────────────────────

// Stable seed rows in `subjects`. Deliberately static — no runtime lookup.
const SUBJECT_MAP = {
  english_literature: "3cde470d-a359-4fe1-b014-5ca3330c0f9c",
  history_civics: "1be96c4d-8b37-4183-8b0c-c945e9409d23",
};

// Where each subject's extracted JSON lives, and how its files are named.
const SOURCES = {
  english_literature: {
    dir: "boardedge-data/literature/extracted",
    file: (year) => `LitPPA-${year}_marking_scheme.json`,
  },
  history_civics: {
    dir: "boardedge-data/history/extracted",
    file: (year) => `HisPPA-${year}_marking_scheme.json`,
  },
};

const YEARS = [2018, 2019, 2020, 2023, 2024, 2025];

const VALID_EVALUATION_MODES = new Set(["deterministic", "point_based", "rubric_based"]);
const VALID_QUESTION_TYPES = new Set(["mcq", "subjective"]);
const VALID_SECTIONS = new Set(["section_a", "section_b"]);

// PostgREST rejects very large single payloads; chunk writes.
const CHUNK = 200;

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { subject: null, year: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--subject") args.subject = argv[++i];
    else if (a === "--year") args.year = argv[++i];
    else if (a.startsWith("--subject=")) args.subject = a.slice("--subject=".length);
    else if (a.startsWith("--year=")) args.year = a.slice("--year=".length);
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return args;
}

function usage(message) {
  console.error(`${message}

Usage:
  node scripts/load-pyqs.mjs --subject <english_literature|history_civics|all> --year <YYYY|all> [--dry-run]

Available years: ${YEARS.join(", ")}`);
  process.exit(1);
}

function resolveTargets({ subject, year }) {
  if (!subject) usage("Missing --subject.");
  if (!year) usage("Missing --year.");

  const subjects = subject === "all" ? Object.keys(SOURCES) : [subject];
  for (const s of subjects) {
    if (!SOURCES[s]) usage(`Unknown subject: ${subject}`);
    // Fail fast on a SUBJECT_MAP miss, before any file or DB work.
    if (!SUBJECT_MAP[s]) throw new Error(`Unknown subject: ${s}`);
  }

  let years;
  if (year === "all") {
    years = YEARS;
  } else {
    const parsed = Number(year);
    if (!YEARS.includes(parsed)) usage(`Unknown year: ${year}`);
    years = [parsed];
  }

  const targets = [];
  for (const s of subjects) {
    for (const y of years) {
      targets.push({
        subject: s,
        year: y,
        filePath: path.join(ROOT, SOURCES[s].dir, SOURCES[s].file(y)),
      });
    }
  }
  return targets;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/** Returns an array of `{ question_code, reason }`; empty means the file is clean. */
function validateQuestions(questions, subjectId) {
  const failures = [];
  const seen = new Set();

  questions.forEach((q, i) => {
    const code = q.question_id;
    const label = typeof code === "string" && code ? code : `<index ${i}>`;
    const fail = (reason) => failures.push({ question_code: label, reason });

    if (typeof code !== "string" || code.trim() === "") {
      fail("question_code (question_id) is missing or not a non-empty string");
    } else if (seen.has(code)) {
      fail("duplicate question_code within this file");
    } else {
      seen.add(code);
    }

    if (!Number.isInteger(q.total_marks) || q.total_marks <= 0) {
      fail(`total_marks must be a positive integer (got ${JSON.stringify(q.total_marks)})`);
    }
    if (!VALID_EVALUATION_MODES.has(q.evaluation_mode)) {
      fail(
        `evaluation_mode must be one of ${[...VALID_EVALUATION_MODES].join(", ")} (got ${JSON.stringify(q.evaluation_mode)})`
      );
    }
    if (!VALID_QUESTION_TYPES.has(q.question_type)) {
      fail(
        `question_type must be one of ${[...VALID_QUESTION_TYPES].join(", ")} (got ${JSON.stringify(q.question_type)})`
      );
    }
    if (!VALID_SECTIONS.has(q.section)) {
      fail(`section must be one of ${[...VALID_SECTIONS].join(", ")} (got ${JSON.stringify(q.section)})`);
    }

    if (q.question_type === "mcq") {
      if (!Array.isArray(q.options) || q.options.length !== 4) {
        fail(
          `mcq must have an options array of exactly 4 items (got ${Array.isArray(q.options) ? q.options.length : typeof q.options})`
        );
      }
      if (q.correct_option == null) fail("mcq must have a non-null correct_option");
    }

    if (q.question_type === "subjective") {
      if (!Array.isArray(q.key_points) || q.key_points.length === 0) {
        fail("subjective question must have a non-empty key_points array");
      }
      if (q.points_selection == null) {
        fail("subjective question must have a non-null points_selection");
      }
    }

    if (!subjectId) fail("subject_id could not be resolved from SUBJECT_MAP");
  });

  return failures;
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

function mapQuestionRow(q, { subjectId, paper }) {
  return {
    subject_id: subjectId,

    // Core
    question_code: q.question_id,
    year: q.year,
    // `paper` is NOT NULL and is part of the (subject_id, year, paper,
    // question_number) unique key /api/evaluate looks questions up by. It is
    // file-level, not per-question.
    paper,
    section: q.section,
    section_label: q.section_label ?? null,
    sub_section: q.sub_section ?? null,
    question_type: q.question_type,
    evaluation_mode: q.evaluation_mode,
    question_number: q.question_number,
    question_text: q.question_text,
    scheme_text: q.scheme_text ?? null,
    examiner_comment: q.examiner_comment ?? null,
    teacher_suggestion: q.teacher_suggestion ?? null,
    difficulty_flag: q.difficulty_flag ?? null,
    points_selection: q.points_selection ?? null,
    points_required: q.points_required ?? null,
    parent_question_number: q.parent_question_number ?? null,
    parent_question_text: q.parent_question_text ?? null,
    key_points: q.key_points ?? [],

    // /api/evaluate branches on is_subjective, not question_type.
    is_subjective: q.question_type !== "mcq",

    // MCQ
    options: q.options ?? null,
    correct_option: q.correct_option ?? null,
    correct_answer_text: q.correct_answer_text ?? null,
    // matchObjectiveAnswer() reads `correct_answer`; without it the objective
    // path bails out with "answer key hasn't been added yet".
    correct_answer: q.question_type === "mcq" ? (q.correct_option ?? null) : null,
    has_image: q.has_image ?? false,
    image_description: q.image_description ?? null,

    // English Literature
    literary_work: q.literary_work ?? null,
    extract: q.extract ?? null,
    response_type: q.response_type ?? null,
    requires_textual_evidence: q.requires_textual_evidence ?? false,
    expected_references: q.expected_references ?? null,
    marking_logic: q.marking_logic ?? null,

    // History & Civics
    domain: q.domain ?? null,
    topic: q.topic ?? null,
    period: q.period ?? null,
    date_range: q.date_range ?? null,
    mcq_variant: q.mcq_variant ?? null,
    assertion: q.assertion ?? null,
    reason: q.reason ?? null,
    table_data: q.table_data ?? null,
    stimulus: q.stimulus ?? null,
    constitutional_reference: q.constitutional_reference ?? null,
    factual_anchors: q.factual_anchors ?? [],
    analytical_criteria: q.analytical_criteria ?? null,
    common_error: q.common_error ?? null,
  };
}

// `total_marks` and `model_answer` are not columns on `questions` — they live
// on `marking_schemes`, which is what /api/evaluate reads to grade an answer.
function mapSchemeRow(q, questionId) {
  return {
    question_id: questionId,
    scheme_text: q.scheme_text ?? q.model_answer ?? q.correct_answer_text ?? "",
    total_marks: q.total_marks,
    key_points: q.key_points ?? [],
    model_answer: q.model_answer ?? null,
    model_answer_verified: false,
    examiner_notes: q.examiner_comment ?? null,
  };
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

function chunked(rows, size) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "[BoardEdge] Supabase connection failed: NEXT_PUBLIC_SUPABASE_URL and " +
        "SUPABASE_SERVICE_ROLE_KEY must both be set. Check .env.local."
    );
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Writes one file's questions as a single batch, then their marking schemes.
 * Throws on the first Supabase error so the caller can abort this file.
 */
async function loadFile(supabase, questions, paper, subjectId) {
  const questionRows = questions.map((q) => mapQuestionRow(q, { subjectId, paper }));

  // Upsert on the existing (subject_id, year, paper, question_number) unique
  // constraint. `question_code` has no unique index, so it cannot be the
  // conflict target.
  const idByCode = new Map();
  for (const batch of chunked(questionRows, CHUNK)) {
    const { data, error } = await supabase
      .from("questions")
      .upsert(batch, { onConflict: "subject_id,year,paper,question_number" })
      .select("id, question_code");
    if (error) throw new Error(`questions upsert failed: ${error.message}`);
    for (const row of data) idByCode.set(row.question_code, row.id);
  }

  const schemeRows = [];
  for (const q of questions) {
    const id = idByCode.get(q.question_id);
    if (!id) throw new Error(`no question id returned for ${q.question_id}`);
    schemeRows.push(mapSchemeRow(q, id));
  }

  // marking_schemes.question_id has no unique constraint, so replace rather
  // than upsert. This keeps a re-run idempotent instead of accumulating
  // duplicate schemes for the same question.
  const ids = [...idByCode.values()];
  for (const batch of chunked(ids, CHUNK)) {
    const { error } = await supabase.from("marking_schemes").delete().in("question_id", batch);
    if (error) throw new Error(`marking_schemes delete failed: ${error.message}`);
  }
  for (const batch of chunked(schemeRows, CHUNK)) {
    const { error } = await supabase.from("marking_schemes").insert(batch);
    if (error) throw new Error(`marking_schemes insert failed: ${error.message}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targets = resolveTargets(args);
  const supabase = args.dryRun ? null : createSupabase();

  let filesOk = 0;
  let filesFailed = 0;
  let filesSkipped = 0;
  let grandTotal = 0;

  for (const target of targets) {
    const name = path.basename(target.filePath);

    if (!fs.existsSync(target.filePath)) {
      console.warn(`! ${name}: source file not found, skipping (${path.relative(ROOT, target.filePath)})`);
      filesSkipped++;
      continue;
    }

    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(target.filePath, "utf8"));
    } catch (err) {
      console.error(`x ${name}: JSON parse failure — ${err.message}. Skipping file.`);
      filesFailed++;
      continue;
    }

    const questions = Array.isArray(doc.questions) ? doc.questions : [];
    const subjectId = SUBJECT_MAP[doc.subject ?? target.subject];
    if (!subjectId) throw new Error(`Unknown subject: ${doc.subject ?? target.subject}`);

    const mcq = questions.filter((q) => q.question_type === "mcq").length;
    const subjective = questions.length - mcq;

    const failures = validateQuestions(questions, subjectId);
    if (failures.length > 0) {
      console.error(`x ${name}: ${failures.length} validation failure(s) — aborting file, nothing written.`);
      for (const f of failures) console.error(`    ${f.question_code}: ${f.reason}`);
      console.error(`  ${name}: ${questions.length} processed, ${mcq} MCQ, ${subjective} subjective`);
      filesFailed++;
      continue;
    }

    if (args.dryRun) {
      console.log(
        `[DRY RUN] ${name}: ${questions.length} questions validated (${mcq} MCQ, ${subjective} subjective)`
      );
      filesOk++;
      grandTotal += questions.length;
      continue;
    }

    try {
      await loadFile(supabase, questions, doc.paper, subjectId);
      console.log(`✓ ${name}: ${questions.length} questions loaded (${mcq} MCQ, ${subjective} subjective)`);
      filesOk++;
      grandTotal += questions.length;
    } catch (err) {
      console.error(`x ${name}: ${err.message}`);
      console.error(`  ${name}: ${questions.length} processed, ${mcq} MCQ, ${subjective} subjective — file aborted.`);
      filesFailed++;
    }
  }

  const verb = args.dryRun ? "validated" : "loaded";
  console.log(
    `\n${filesOk} file(s) ${verb}, ${filesFailed} failed, ${filesSkipped} skipped — ${grandTotal} questions.`
  );

  if (!args.dryRun && filesOk > 0) {
    console.log(`
Load complete. Run the following in Supabase SQL editor to verify:

SELECT subject_id, section, evaluation_mode, COUNT(*)
FROM questions
WHERE subject_id IN (
  '${SUBJECT_MAP.english_literature}',
  '${SUBJECT_MAP.history_civics}'
)
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;

Expected total: ${grandTotal} rows across both subjects.`);
  }

  if (filesFailed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`[BoardEdge] ${err.message}`);
  process.exit(1);
});
