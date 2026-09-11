/**
 * backfill_chapters_by_topic.mjs
 * BoardEdge — Backfill questions.chapter from a hand-curated topic→chapter map.
 *
 * Purely a dictionary lookup — no Anthropic client, no LLM calls, no
 * increment_usage. The mapping itself lives in scripts/chapter-maps/<subject>.json
 * (one flat { "exact topic string": "Chapter Name" } object per subject),
 * filled in by hand referencing the official ICSE syllabus.
 *
 * Usage:
 *   node scripts/backfill_chapters_by_topic.mjs --subject chemistry
 *   node scripts/backfill_chapters_by_topic.mjs --subject chemistry --apply
 *
 * Dry-run by default: prints a per-topic report (mapped chapter, or
 * "⚠ unmapped", plus question count) without writing anything. Pass --apply
 * to actually run the UPDATEs. Topics with a blank or missing map entry are
 * left chapter = null (the "Other" bucket in the UI) rather than guessed.
 *
 * Safe to re-run — each UPDATE is scoped to (subject_id, topic), so filling
 * in more of the map and re-running only touches the newly-mapped topics.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
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
  physics: "Physics",
  biology: "Biology",
  geography: "Geography",
  history: "History & Civics",
};

if (!subjectSlug || !SUBJECT_NAMES[subjectSlug]) {
  console.error(`Usage: node scripts/backfill_chapters_by_topic.mjs --subject <${Object.keys(SUBJECT_NAMES).join("|")}> [--apply]`);
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing env vars in .env.local (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  const subjectName = SUBJECT_NAMES[subjectSlug];
  const mapPath = path.join(ROOT, "scripts", "chapter-maps", `${subjectSlug}.json`);

  let topicToChapter;
  try {
    topicToChapter = JSON.parse(readFileSync(mapPath, "utf-8"));
  } catch (err) {
    console.error(`Cannot read/parse ${mapPath}: ${err.message}`);
    process.exit(1);
  }

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

  const { data: rows, error: qErr } = await supabase
    .from("questions")
    .select("id, topic")
    .eq("subject_id", subjectId);

  if (qErr) {
    console.error(`Failed to fetch questions: ${qErr.message}`);
    process.exit(1);
  }

  const countByTopic = new Map();
  for (const r of rows) {
    const key = r.topic ?? null;
    countByTopic.set(key, (countByTopic.get(key) ?? 0) + 1);
  }

  console.log(`\n${subjectName}${APPLY ? "" : "  [DRY RUN — pass --apply to write]"}`);
  console.log(`${rows.length} question(s), ${countByTopic.size} distinct topic value(s) (including null)\n`);

  let mapped = 0, unmapped = 0, nullTopic = 0, updated = 0, failed = 0;

  for (const [topic, count] of [...countByTopic.entries()].sort((a, b) => (a[0] ?? "").localeCompare(b[0] ?? ""))) {
    if (topic === null) {
      nullTopic += count;
      console.log(`  (no topic)                                          — ${count} question(s) — stays "Other"`);
      continue;
    }

    const chapter = topicToChapter[topic];
    if (!chapter) {
      unmapped++;
      console.log(`  ⚠ unmapped: "${topic}" — ${count} question(s) — stays "Other"`);
      continue;
    }

    mapped++;
    console.log(`  "${topic}" → "${chapter}" — ${count} question(s)`);

    if (APPLY) {
      const { data, error } = await supabase
        .from("questions")
        .update({ chapter })
        .eq("subject_id", subjectId)
        .eq("topic", topic)
        .select("id");

      if (error) {
        failed++;
        console.error(`    ❌ update failed: ${error.message}`);
      } else {
        updated += data?.length ?? 0;
      }
    }
  }

  console.log(
    `\n${mapped} topic(s) mapped, ${unmapped} unmapped, ${nullTopic} question(s) with no topic.` +
    (APPLY ? ` ${updated} row(s) updated${failed ? `, ${failed} topic(s) failed` : ""}.` : " Re-run with --apply to write."),
  );
}

main();
