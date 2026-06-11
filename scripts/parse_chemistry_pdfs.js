/**
 * Parses ICSE Chemistry PPA PDFs, sends text to Claude for structured extraction,
 * and inserts rows into Supabase `questions` and `marking_schemes`.
 *
 * Env (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ANTHROPIC_API_KEY
 *
 * Run: node scripts/parse_chemistry_pdfs.js
 */

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const pdfParse = require("pdf-parse");
const { createClient } = require("@supabase/supabase-js");
const Anthropic = require("@anthropic-ai/sdk");

const ROOT = path.resolve(__dirname, "..");
const CHEM_DIR = path.join(ROOT, "boardedge-data", "chemistry");
const SUBJECT_ID = "de0b2975-a0fa-40c1-810e-21900bfa7834";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";

const SYSTEM_PROMPT =
  'You are a data extraction assistant. Extract every question from this ICSE Chemistry Pupil Performance Analysis document. For each question return a JSON array where each item has:\n' +
  "- question_number (string, e.g. '1(i)', '3(ii)(a)')\n" +
  "- question_text (string — exact question as written)\n" +
  "- total_marks (number — from the marks in brackets)\n" +
  "- key_points (array of strings — from the marking scheme)\n" +
  "- accepted_alternatives (array of strings — alternative accepted answers)\n" +
  "- common_errors (array of strings — from examiner comments)\n" +
  "- model_answer (string — council-style answer combining marking scheme and examiner commentary)\n" +
  "- examiner_notes (string — summary of examiner comments)\n" +
  "Return only valid JSON array. No preamble, no markdown backticks.";

function loadEnv() {
  const envLocal = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envLocal)) {
    console.warn(
      `Warning: ${envLocal} not found. Create it with Supabase URL, SUPABASE_SERVICE_ROLE_KEY, and ANTHROPIC_API_KEY.`,
    );
    return;
  }
  dotenv.config({ path: envLocal });
}

function getSupabaseUrl() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ""
  ).trim();
}

function getSupabaseServiceRoleKey() {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
}

/**
 * Prefers a 4-digit year in the filename; otherwise interprets ChemPPA-YY.pdf as 20YY / 19YY.
 */
function yearFromFilename(fileBasename) {
  const four = fileBasename.match(/\b(19\d{2}|20\d{2})\b/);
  if (four) return parseInt(four[1], 10);

  const chem = fileBasename.match(/ChemPPA-(\d{2})\.pdf/i);
  if (chem) {
    const yy = parseInt(chem[1], 10);
    return yy >= 70 ? 1900 + yy : 2000 + yy;
  }

  const tail = fileBasename.match(/-(\d{2})\.pdf$/i);
  if (tail) {
    const yy = parseInt(tail[1], 10);
    return yy >= 70 ? 1900 + yy : 2000 + yy;
  }

  throw new Error(`Could not extract year from filename: ${fileBasename}`);
}

function extractJsonArray(raw) {
  const trimmed = String(raw).trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      throw new Error("Top-level JSON is not an array");
    }
    return parsed;
  } catch {
    const start = trimmed.indexOf("[");
    const end = trimmed.lastIndexOf("]");
    if (start !== -1 && end > start) {
      const sliced = trimmed.slice(start, end + 1);
      const parsed = JSON.parse(sliced);
      if (!Array.isArray(parsed)) {
        throw new Error("Extracted JSON is not an array");
      }
      return parsed;
    }
    throw new Error("Could not parse JSON array from model response");
  }
}

function normalizeQuestionRow(item, index) {
  const qp = item && typeof item === "object" ? item : {};
  const keyPoints = Array.isArray(qp.key_points) ? qp.key_points.map(String) : [];
  const accepted = Array.isArray(qp.accepted_alternatives)
    ? qp.accepted_alternatives.map(String)
    : [];
  const errors = Array.isArray(qp.common_errors)
    ? qp.common_errors.map(String)
    : [];

  const totalMarksRaw = qp.total_marks;
  const total_marks =
    typeof totalMarksRaw === "number" && !Number.isNaN(totalMarksRaw)
      ? totalMarksRaw
      : parseFloat(String(totalMarksRaw ?? "").replace(/[^\d.-]/g, "")) || 0;

  return {
    question_number: qp.question_number != null ? String(qp.question_number) : `idx-${index + 1}`,
    question_text: qp.question_text != null ? String(qp.question_text) : "",
    total_marks,
    key_points: keyPoints,
    accepted_alternatives: accepted,
    common_errors: errors,
    model_answer: qp.model_answer != null ? String(qp.model_answer) : "",
    examiner_notes: qp.examiner_notes != null ? String(qp.examiner_notes) : "",
  };
}

function schemeTextFromKeyPoints(keyPoints) {
  return keyPoints.join("\n");
}

async function extractQuestionsWithClaude(client, documentText, label) {
  const maxChars = 450_000;
  const body =
    documentText.length > maxChars
      ? `${documentText.slice(0, maxChars)}\n\n[TRUNCATED — document exceeded ${maxChars} characters]`
      : documentText;

  console.log(`Calling Claude for ${label} (${body.length} chars of text)...`);

  const message = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 16_384,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: body }],
  });

  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  return extractJsonArray(text);
}

async function insertQuestionAndScheme(supabase, row, year) {
  const { data: qRow, error: qErr } = await supabase
    .from("questions")
    .insert({
      subject_id: SUBJECT_ID,
      year,
      paper: "1",
      question_number: row.question_number,
      question_text: row.question_text,
      topic_id: null,
    })
    .select("id")
    .single();

  if (qErr) throw new Error(`questions insert: ${qErr.message}`);

  const schemeText = schemeTextFromKeyPoints(row.key_points);

  const { error: mErr } = await supabase.from("marking_schemes").insert({
    question_id: qRow.id,
    scheme_text: schemeText,
    total_marks: row.total_marks,
    key_points: row.key_points,
    accepted_alternatives: row.accepted_alternatives,
    common_errors: row.common_errors,
    model_answer: row.model_answer,
    model_answer_verified: true,
    examiner_notes: row.examiner_notes,
  });

  if (mErr) throw new Error(`marking_schemes insert: ${mErr.message}`);

  return qRow.id;
}

async function main() {
  loadEnv();

  const supabaseUrl = getSupabaseUrl();
  const serviceKey = getSupabaseServiceRoleKey();
  const anthropicKey = (process.env.ANTHROPIC_API_KEY || "").trim();

  if (!supabaseUrl || !serviceKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
    process.exit(1);
  }
  if (!anthropicKey) {
    console.error("Missing ANTHROPIC_API_KEY in .env.local");
    process.exit(1);
  }

  if (!fs.existsSync(CHEM_DIR)) {
    console.error(
      `Folder not found: ${CHEM_DIR}\nCreate it and place Chemistry PDFs there (e.g. ChemPPA-20.pdf).`,
    );
    process.exit(1);
  }

  const files = fs
    .readdirSync(CHEM_DIR)
    .filter((n) => n.toLowerCase().endsWith(".pdf"))
    .sort();

  if (files.length === 0) {
    console.error(`No PDF files in ${CHEM_DIR}`);
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  for (const name of files) {
    const full = path.join(CHEM_DIR, name);
    let year;
    try {
      year = yearFromFilename(name);
    } catch (e) {
      console.error(`[${name}] Skip: ${e.message}`);
      continue;
    }

    console.log(`\n=== Processing ${name} (year ${year}) ===`);

    let pdfText;
    try {
      const buf = fs.readFileSync(full);
      const parsed = await pdfParse(buf);
      pdfText = parsed.text || "";
    } catch (e) {
      console.error(`[${name}] pdf-parse failed:`, e.message || e);
      continue;
    }

    if (!pdfText.trim()) {
      console.error(`[${name}] No text extracted from PDF, skipping.`);
      continue;
    }

    let items;
    try {
      items = await extractQuestionsWithClaude(anthropic, pdfText, name);
    } catch (e) {
      console.error(`[${name}] Claude / JSON parse failed:`, e.message || e);
      continue;
    }

    const normalized = items.map((it, i) => normalizeQuestionRow(it, i));
    const total = normalized.length;

    for (let i = 0; i < total; i++) {
      const row = normalized[i];
      const n = i + 1;
      try {
        await insertQuestionAndScheme(supabase, row, year);
        console.log(`Inserted question ${n} of ${total} for year ${year}`);
      } catch (e) {
        console.error(
          `[${name}] Failed question ${n} of ${total} (${row.question_number}):`,
          e.message || e,
        );
      }
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
