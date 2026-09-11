/**
 * backfill_chapter_topic_from_json.mjs
 * BoardEdge — Backfill questions.chapter AND questions.topic from the
 * per-question chapter-topic JSON files under boardedge-data/<subject>/chapter-topic/.
 *
 * Covers Chemistry, Biology, Geography, and (as of the question_number(s)
 * additions) History & Civics — every subject whose files are keyed by
 * question number in some form. (Physics's files remain a flat chapter/topic
 * vocabulary with no per-question link at all; see backfill_chapters_by_topic.mjs
 * + scripts/chapter-maps/physics.json for that one instead.)
 *
 * File shapes handled:
 *   { "year": 2018, "paper": "2", "chapter_topic_mapping": [ {question_number, chapter, topic}, ... ] }
 *   { "year": 2018, "paper": 1,   "chapter_topic_map":     [ {question_number, chapter, topic}, ... ] }
 *   [ {question_number, chapter, topic}, ... ]                  — year parsed from the filename, paper ignored
 *   [ {question_numbers: [...], chapter, topic}, ... ]          — History's 2018-2023 files: one
 *     topic can cover several question numbers in the same paper; each is expanded into its own
 *     (chapter, topic, question_number) entry before matching.
 *
 * The join key is (subject_id, year, question_number) — NOT paper. A live
 * check confirmed every one of these subjects has exactly one paper per
 * (year, question_number) combination in the DB, and the source files
 * disagree with each other and with the DB on paper values (e.g. Chemistry's
 * own files say paper "2" for 2018/2019 but "1" for 2020/2024/2025), so
 * matching on paper as well would silently drop rows rather than help.
 *
 * This OVERWRITES the existing (coarse) `topic` column with the new,
 * finer-grained value from these files, in addition to setting `chapter` —
 * unlike the topic-vocabulary backfill for Physics/History, which only ever
 * touches `chapter`. Review the dry-run output before passing --apply.
 *
 * Usage:
 *   node scripts/backfill_chapter_topic_from_json.mjs --subject chemistry
 *   node scripts/backfill_chapter_topic_from_json.mjs --subject chemistry --apply
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "dotenv";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(ROOT, ".env.local") });

const APPLY = process.argv.includes("--apply");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1];
}

const subjectSlug = argValue("--subject");
const SUBJECT_NAMES = {
  chemistry: "Chemistry",
  biology: "Biology",
  geography: "Geography",
  history: "History & Civics",
};

if (!subjectSlug || !SUBJECT_NAMES[subjectSlug]) {
  console.error(`Usage: node scripts/backfill_chapter_topic_from_json.mjs --subject <${Object.keys(SUBJECT_NAMES).join("|")}> [--apply]`);
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing env vars in .env.local (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// "chapter-topic_Bio2018.json" -> 2018, "chapter-topic_Geo24.json" -> 2024
function yearFromFilename(filename) {
  const m = filename.match(/(\d{2,4})(?=\.json$)/);
  if (!m) return null;
  const digits = m[1];
  if (digits.length === 4) return Number(digits);
  if (digits.length === 2) return 2000 + Number(digits);
  return null;
}

// Expands { question_numbers: [...], chapter, topic } into one entry per
// question number; passes through entries that already carry a single
// question_number unchanged.
function expandEntries(entries) {
  const out = [];
  for (const e of entries) {
    if (Array.isArray(e.question_numbers)) {
      for (const qn of e.question_numbers) out.push({ chapter: e.chapter, topic: e.topic, question_number: qn });
    } else {
      out.push(e);
    }
  }
  return out;
}

function loadEntries(filePath) {
  const raw = JSON.parse(readFileSync(filePath, "utf-8"));
  if (Array.isArray(raw)) return { year: null, entries: expandEntries(raw) };
  const entries = raw.chapter_topic_mapping ?? raw.chapter_topic_map ?? raw.mapping ?? [];
  return { year: raw.year ?? null, entries: expandEntries(entries) };
}

async function main() {
  const subjectName = SUBJECT_NAMES[subjectSlug];
  const dir = path.join(ROOT, "boardedge-data", subjectSlug, "chapter-topic");

  const { data: subjectRow, error: subjErr } = await supabase
    .from("subjects")
    .select("id")
    .eq("name", subjectName)
    .single();

  if (subjErr || !subjectRow) {
    console.error(`Could not find subject "${subjectName}": ${subjErr?.message ?? "not found"}`);
    process.exit(1);
  }
  const subjectId = subjectRow.id;

  console.log(`\n${subjectName}${APPLY ? "" : "  [DRY RUN — pass --apply to write]"}`);

  let totalEntries = 0, updated = 0, notFound = 0, failed = 0, skippedNoQN = 0;

  for (const filename of readdirSync(dir).sort()) {
    const filePath = path.join(dir, filename);
    const { year: fileYear, entries } = loadEntries(filePath);
    const year = fileYear ?? yearFromFilename(filename);

    if (!year) {
      console.error(`  ⚠ ${filename}: could not determine year — skipping file`);
      continue;
    }

    console.log(`\n  ${filename} (year ${year}, ${entries.length} entries)`);

    for (const entry of entries) {
      totalEntries++;
      if (!entry.question_number) { skippedNoQN++; continue; }

      if (APPLY) {
        const { data, error } = await supabase
          .from("questions")
          .update({ chapter: entry.chapter ?? null, topic: entry.topic ?? null })
          .eq("subject_id", subjectId)
          .eq("year", year)
          .eq("question_number", entry.question_number)
          .select("id");

        if (error) {
          failed++;
          console.error(`    ❌ Q${entry.question_number}: ${error.message}`);
        } else if (!data || data.length === 0) {
          notFound++;
          console.log(`    ⚠ Q${entry.question_number}: no matching question row (subject/year/question_number)`);
        } else {
          updated += data.length;
        }
      } else {
        console.log(`    Q${entry.question_number} → chapter="${entry.chapter}", topic="${entry.topic}"`);
      }
    }
  }

  console.log(
    `\n${totalEntries} mapping entries read${skippedNoQN ? `, ${skippedNoQN} skipped (no question_number)` : ""}.` +
    (APPLY
      ? ` ${updated} row(s) updated, ${notFound} not found in DB${failed ? `, ${failed} failed` : ""}.`
      : " Re-run with --apply to write (each UPDATE also OVERWRITES the existing topic column)."),
  );
}

main();
