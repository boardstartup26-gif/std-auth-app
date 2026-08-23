/**
 * extract_diagrams.mjs
 * BoardEdge — Extract diagram images from raw past-paper PDFs, crop just the
 *             diagram region, upload to Supabase Storage, and set diagram_url
 *             on matching questions. Covers both reference-diagram questions
 *             (student reads the figure to answer in text) and draw-type
 *             questions (student would draw/copy the figure) — the latter
 *             still stay blocked from text-answer submission in the app, but
 *             showing the source diagram for context is useful regardless.
 *
 * Usage (from project root):
 *   node scripts/extract_diagrams.mjs                       # all subjects, first-time discovery
 *   node scripts/extract_diagrams.mjs --subject chemistry   # one subject
 *   node scripts/extract_diagrams.mjs --dry-run             # preview only
 *   node scripts/extract_diagrams.mjs --recrop              # re-crop questions that
 *                                                            # currently point at an old
 *                                                            # full-page image (page_N.png)
 *                                                            # into a tight crop, reusing
 *                                                            # the already-known page number
 *
 * Requires: .env.local with NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *           and ANTHROPIC_API_KEY.
 *
 * Idempotent: first-time discovery skips questions that already have a
 * diagram_url set. --recrop only targets questions whose diagram_url still
 * points at the old full-page format.
 */

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { config } from "dotenv";
import { createCanvas } from "@napi-rs/canvas";

config({ path: ".env.local" });

const DRY_RUN = process.argv.includes("--dry-run");
const RECROP = process.argv.includes("--recrop");
const SUBJECT_FLAG = process.argv.indexOf("--subject");
const SUBJECT_FILTER =
  SUBJECT_FLAG !== -1 ? process.argv[SUBJECT_FLAG + 1] : null;

// ─── Env ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const DATA_DIR = join(process.cwd(), "boardedge-data");
const BUCKET = "question-diagrams";
const RENDER_SCALE = 2.0;
const CROP_PAD_FRACTION = 0.06; // padding around detected bbox, as a fraction of its own size

// ─── Subject → prefix mapping (matches PDF naming) ─────────────────────────

const SUBJECT_MAP = {
  chemistry: { prefix: "ChemPPA", dbName: "Chemistry" },
  biology: { prefix: "BioPPA", dbName: "Biology" },
  physics: { prefix: "PhyPPA", dbName: "Physics" },
  geography: { prefix: "GeoPPA", dbName: "Geography" },
};

// ─── PDF rendering ──────────────────────────────────────────────────────────

async function loadPdfjs() {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsLib;
}

async function renderPage(pdfDoc, pageNum) {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext("2d");

  await page.render({
    canvasContext: ctx,
    viewport,
    canvas,
  }).promise;

  return { canvas, width: viewport.width, height: viewport.height };
}

// ─── Cropping ───────────────────────────────────────────────────────────────

// bbox is [x0, y0, x1, y1] normalized 0-1000 relative to page width/height
// (Claude's standard grounding convention).
function cropToBuffer(sourceCanvas, pageWidth, pageHeight, bbox) {
  // Claude occasionally returns a coordinate just past the 0-1000 range
  // (e.g. y1=1145) — clamp before scaling so a near-miss doesn't collapse
  // into a zero-height crop.
  const clamp1000 = (v) => Math.min(1000, Math.max(0, v));
  let [x0, y0, x1, y1] = bbox.map(clamp1000);
  let px0 = (x0 / 1000) * pageWidth;
  let py0 = (y0 / 1000) * pageHeight;
  let px1 = (x1 / 1000) * pageWidth;
  let py1 = (y1 / 1000) * pageHeight;

  const padX = (px1 - px0) * CROP_PAD_FRACTION;
  const padY = (py1 - py0) * CROP_PAD_FRACTION;
  px0 = Math.max(0, px0 - padX);
  py0 = Math.max(0, py0 - padY);
  px1 = Math.min(pageWidth, px1 + padX);
  py1 = Math.min(pageHeight, py1 + padY);

  const w = Math.round(px1 - px0);
  const h = Math.round(py1 - py0);

  // A malformed bbox (e.g. y1 <= y0 from a bad Claude response) used to get
  // silently clamped to a 1px sliver here, which then uploaded and got
  // recorded as a "successful" match — a degenerate image that renders as
  // nothing in the UI. Reject it instead so the caller can skip and retry.
  if (w < 15 || h < 15) return null;

  const target = createCanvas(w, h);
  const ctx = target.getContext("2d");
  ctx.drawImage(sourceCanvas, px0, py0, w, h, 0, 0, w, h);
  return target.toBuffer("image/png");
}

function sanitizeQuestionNumber(qn) {
  return qn.replace(/[^a-zA-Z0-9]+/g, "_");
}

// The extracted JSON's question_number strings don't always match the DB's
// exactly (e.g. JSON "2(v)(b)1" vs DB "2(v)(b)(1)") — normalize away all
// non-alphanumeric characters before comparing, so matching is format-agnostic.
function normalizeQN(qn) {
  return qn.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

async function buildQuestionNumberIndex(subjectId, year) {
  const { data } = await supabase
    .from("questions")
    .select("question_number")
    .eq("subject_id", subjectId)
    .eq("year", year);

  const index = new Map();
  for (const r of data ?? []) {
    index.set(normalizeQN(r.question_number), r.question_number);
  }
  return index;
}

// ─── Claude vision: identify diagrams + bounding boxes on a page ────────────

async function identifyDiagrams(pageImageBase64, pageNum, diagramQuestions) {
  const questionList = diagramQuestions
    .map((q) => `- ${q.question_number}: "${q.question_text}"`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1536,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: pageImageBase64,
            },
          },
          {
            type: "text",
            text: `This is page ${pageNum} of an ICSE/CISCE past-paper exam. The following questions are marked as requiring a diagram or figure to answer. For each question, determine if its referenced diagram, figure, picture, graph, table, or structural formula is visible on THIS page.

Questions:
${questionList}

For each question found on this page, provide a TIGHT bounding box around ONLY the diagram/figure/graph itself — do NOT include the question text, answer lines, or surrounding unrelated content. The bounding box must use integer coordinates on a 0-1000 scale, where [0,0] is the top-left corner of the page image and [1000,1000] is the bottom-right corner. EVERY coordinate must be between 0 and 1000 inclusive — never negative, never above 1000, even if the diagram appears to extend close to a page edge. Double-check that x_max > x_min and y_max > y_min before answering. Format: [x_min, y_min, x_max, y_max].

Respond with ONLY a JSON array, no markdown fences. Each element:
{"question_number": "...", "found": true/false, "description": "brief description of the diagram if found", "bbox": [x_min, y_min, x_max, y_max]}

Omit "bbox" if found is false. If no diagrams for any of these questions appear on this page, return an empty array [].`,
          },
        ],
      },
    ],
  });

  const text = response.content[0]?.text?.trim() ?? "[]";
  try {
    const cleaned = text.replace(/^```json?\s*/i, "").replace(/```\s*$/, "");
    return JSON.parse(cleaned);
  } catch {
    console.warn(`  ⚠ Could not parse Claude response for page ${pageNum}:`, text.slice(0, 200));
    return [];
  }
}

// ─── Upload to Supabase Storage ─────────────────────────────────────────────

async function uploadCrop(subject, year, questionNumber, pngBuffer) {
  const path = `${subject}/${year}/${sanitizeQuestionNumber(questionNumber)}.png`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, pngBuffer, {
      contentType: "image/png",
      upsert: true,
    });

  if (error) {
    console.error(`  ✗ Upload failed for ${path}:`, error.message);
    return null;
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ─── Update diagram_url on question rows ────────────────────────────────────

async function setDiagramUrl(subjectId, year, questionNumber, url) {
  const { data, error } = await supabase
    .from("questions")
    .update({ diagram_url: url })
    .eq("subject_id", subjectId)
    .eq("year", year)
    .eq("question_number", questionNumber)
    .select("id");

  if (error) {
    console.error(`  ✗ DB update failed for Q${questionNumber}:`, error.message);
    return false;
  }
  if (!data || data.length === 0) {
    // Supabase update() doesn't error on a zero-row match — it just silently
    // does nothing. Without this check a question_number mismatch (e.g. JSON
    // "2(v)(b)1" vs DB "2(v)(b)(1)") looks identical to a real success.
    console.error(`  ✗ No question row matched for Q${questionNumber} (subject/year/number mismatch?)`);
    return false;
  }
  return true;
}

// ─── First-time discovery: scan the whole PDF page by page ─────────────────

async function discoverPdf(pdfjsLib, subject, pdfPath, jsonPath) {
  const cfg = SUBJECT_MAP[subject];
  if (!cfg) {
    console.warn(`  ⚠ Unknown subject: ${subject}, skipping`);
    return;
  }

  const json = JSON.parse(readFileSync(jsonPath, "utf-8"));
  const year = json.year;

  // Includes draw-type questions ("Copy the diagram and...") too — they still
  // stay blocked from text-answer submission (see isDiagramBlocked in
  // evaluate/page.tsx), but showing the source diagram for context is useful
  // even though the student can't submit a drawing as their answer.
  const diagramQuestions = json.marking_schemes.filter(
    (q) => q.diagram_required === true
  );

  if (!diagramQuestions.length) {
    console.log(`  → No diagram questions for ${subject} ${year}`);
    return;
  }

  const { data: subjectRow } = await supabase
    .from("subjects")
    .select("id")
    .eq("name", cfg.dbName)
    .single();

  if (!subjectRow) {
    console.warn(`  ⚠ Subject "${cfg.dbName}" not found in DB, skipping`);
    return;
  }

  const { data: existingRows } = await supabase
    .from("questions")
    .select("question_number, diagram_url")
    .eq("subject_id", subjectRow.id)
    .eq("year", year)
    .not("diagram_url", "is", null);

  const qnIndex = await buildQuestionNumberIndex(subjectRow.id, year);
  const alreadyDoneNorm = new Set((existingRows ?? []).map((r) => normalizeQN(r.question_number)));
  const pending = diagramQuestions.filter((q) => !alreadyDoneNorm.has(normalizeQN(q.question_number)));

  if (!pending.length) {
    console.log(`  → All reference-diagram questions for ${subject} ${year} already have URLs`);
    return;
  }

  console.log(`  → ${pending.length} reference-diagram questions need diagrams (${subject} ${year})`);

  if (DRY_RUN) {
    for (const q of pending) {
      console.log(`    [dry-run] Q${q.question_number}: "${q.question_text.slice(0, 80)}…"`);
    }
    return;
  }

  const pdfData = new Uint8Array(readFileSync(pdfPath));
  const pdfDoc = await pdfjsLib.getDocument({ data: pdfData }).promise;
  const numPages = pdfDoc.numPages;

  console.log(`  → PDF has ${numPages} pages, scanning for diagrams…`);

  const unmatched = new Set(pending.map((q) => normalizeQN(q.question_number)));

  for (let pageNum = 1; pageNum <= numPages && unmatched.size > 0; pageNum++) {
    const { canvas, width, height } = await renderPage(pdfDoc, pageNum);
    const base64 = canvas.toBuffer("image/png").toString("base64");

    const stillPending = pending.filter((q) => unmatched.has(normalizeQN(q.question_number)));
    const askedFor = new Set(stillPending.map((q) => normalizeQN(q.question_number)));
    const matches = await identifyDiagrams(base64, pageNum, stillPending);

    for (const match of matches.filter((m) => m.found && m.bbox && askedFor.has(normalizeQN(m.question_number)))) {
      const dbQuestionNumber = qnIndex.get(normalizeQN(match.question_number));
      if (!dbQuestionNumber) {
        console.warn(`  ⚠ Q${match.question_number} matched by Claude but no DB row found for ${subject} ${year} (normalized: ${normalizeQN(match.question_number)})`);
        continue;
      }

      const cropBuffer = cropToBuffer(canvas, width, height, match.bbox);
      if (!cropBuffer) {
        console.warn(`  ⚠ Q${dbQuestionNumber} had a degenerate bbox [${match.bbox}] on page ${pageNum}, skipping`);
        continue;
      }
      const url = await uploadCrop(subject, year, dbQuestionNumber, cropBuffer);
      if (!url) continue;

      const ok = await setDiagramUrl(subjectRow.id, year, dbQuestionNumber, url);
      if (ok) {
        console.log(`    ✓ Q${dbQuestionNumber} → page ${pageNum} crop (${match.description})`);
        unmatched.delete(normalizeQN(match.question_number));
      }
    }
  }

  if (unmatched.size > 0) {
    const labels = pending
      .filter((q) => unmatched.has(normalizeQN(q.question_number)))
      .map((q) => q.question_number);
    console.warn(`  ⚠ ${unmatched.size} questions not matched to any page:`, labels.join(", "));
  }
}

// ─── Recrop: reuse the already-known page number, just get a tight bbox ────

async function recropPdf(pdfjsLib, subject, pdfPath, jsonPath) {
  const cfg = SUBJECT_MAP[subject];
  if (!cfg) return;

  const json = JSON.parse(readFileSync(jsonPath, "utf-8"));
  const year = json.year;
  const textByNumber = Object.fromEntries(
    json.marking_schemes.map((q) => [q.question_number, q.question_text])
  );

  const { data: subjectRow } = await supabase
    .from("subjects")
    .select("id")
    .eq("name", cfg.dbName)
    .single();
  if (!subjectRow) return;

  const { data: rows } = await supabase
    .from("questions")
    .select("question_number, diagram_url")
    .eq("subject_id", subjectRow.id)
    .eq("year", year)
    .like("diagram_url", "%/page_%.png");

  if (!rows || !rows.length) {
    console.log(`  → No old-format page images to recrop for ${subject} ${year}`);
    return;
  }

  console.log(`  → ${rows.length} questions to recrop (${subject} ${year})`);

  if (DRY_RUN) {
    for (const r of rows) console.log(`    [dry-run] Q${r.question_number}: ${r.diagram_url}`);
    return;
  }

  // Group questions by the page number embedded in their current URL
  const byPage = {};
  for (const r of rows) {
    const m = r.diagram_url.match(/page_(\d+)\.png/);
    if (!m) continue;
    const pageNum = Number(m[1]);
    (byPage[pageNum] ??= []).push(r.question_number);
  }

  const pdfData = new Uint8Array(readFileSync(pdfPath));
  const pdfDoc = await pdfjsLib.getDocument({ data: pdfData }).promise;

  for (const [pageNumStr, questionNumbers] of Object.entries(byPage)) {
    const pageNum = Number(pageNumStr);
    const { canvas, width, height } = await renderPage(pdfDoc, pageNum);
    const base64 = canvas.toBuffer("image/png").toString("base64");

    const questions = questionNumbers.map((qn) => ({
      question_number: qn,
      question_text: textByNumber[qn] ?? "",
    }));

    const matches = await identifyDiagrams(base64, pageNum, questions);
    const askedForNorm = new Set(questionNumbers.map(normalizeQN));

    for (const match of matches.filter((m) => m.found && m.bbox && askedForNorm.has(normalizeQN(m.question_number)))) {
      const dbQuestionNumber =
        questionNumbers.find((qn) => normalizeQN(qn) === normalizeQN(match.question_number)) ??
        match.question_number;

      const cropBuffer = cropToBuffer(canvas, width, height, match.bbox);
      if (!cropBuffer) {
        console.warn(`  ⚠ Q${dbQuestionNumber} had a degenerate bbox [${match.bbox}] on page ${pageNum}, skipping`);
        continue;
      }
      const url = await uploadCrop(subject, year, dbQuestionNumber, cropBuffer);
      if (!url) continue;

      const ok = await setDiagramUrl(subjectRow.id, year, dbQuestionNumber, url);
      if (ok) {
        console.log(`    ✓ Q${dbQuestionNumber} recropped on page ${pageNum} (${match.description})`);
      }
    }

    const foundNumbers = new Set(matches.filter((m) => m.found).map((m) => m.question_number));
    for (const qn of questionNumbers) {
      if (!foundNumbers.has(qn)) {
        console.warn(`  ⚠ Q${qn} no longer matched on page ${pageNum} during recrop`);
      }
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function forEachPdfJsonPair(subjects, fn) {
  const pdfjsLib = await loadPdfjs();

  for (const subject of subjects) {
    console.log(`\n═══ ${subject.toUpperCase()} ═══`);

    const rawDir = join(DATA_DIR, subject, "raw");
    const extractedDir = join(DATA_DIR, subject, "extracted");

    if (!existsSync(rawDir) || !existsSync(extractedDir)) {
      console.log(`  → No data directory for ${subject}, skipping`);
      continue;
    }

    const pdfs = readdirSync(rawDir).filter((f) => f.endsWith(".pdf"));
    const jsons = readdirSync(extractedDir).filter((f) => f.endsWith("_marking_scheme.json"));

    for (const jsonFile of jsons) {
      const yearMatch = jsonFile.match(/(\d{2,4})/);
      if (!yearMatch) continue;

      const yearSuffix = yearMatch[1];
      const matchingPdf = pdfs.find((p) => p.includes(yearSuffix));

      if (!matchingPdf) {
        console.log(`  → No PDF found for ${jsonFile}, skipping`);
        continue;
      }

      console.log(`  Processing ${matchingPdf} ↔ ${jsonFile}`);

      try {
        await fn(pdfjsLib, subject, join(rawDir, matchingPdf), join(extractedDir, jsonFile));
      } catch (err) {
        console.error(`  ✗ Error processing ${matchingPdf}:`, err.message);
      }
    }
  }
}

async function main() {
  const subjects = SUBJECT_FILTER ? [SUBJECT_FILTER] : Object.keys(SUBJECT_MAP);
  await forEachPdfJsonPair(subjects, RECROP ? recropPdf : discoverPdf);
  console.log("\n✓ Done");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
