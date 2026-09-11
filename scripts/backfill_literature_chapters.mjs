/**
 * backfill_literature_chapters.mjs
 * BoardEdge — Backfill English Literature questions.chapter from literary_work.title.
 *
 * English Literature's questions.topic is entirely unpopulated (0/354), but
 * every row carries a structured literary_work.{title, author, work_type} —
 * the poem/story/play a question is drawn from is the natural chapter
 * grouping for a literature paper, so this sets chapter directly from that
 * field. No mapping file, no LLM calls — a straight column-to-column copy.
 *
 * Usage:
 *   node scripts/backfill_literature_chapters.mjs
 *   node scripts/backfill_literature_chapters.mjs --apply
 *
 * Dry-run by default: prints each distinct literary_work.title found and how
 * many questions it covers, without writing. Pass --apply to run the UPDATEs.
 * Rows with no literary_work (or no title) are left chapter = null.
 *
 * Safe to re-run — idempotent (each UPDATE just re-sets the same value).
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "dotenv";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(ROOT, ".env.local") });

const APPLY = process.argv.includes("--apply");

const SUBJECT_NAME = "English Literature";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing env vars in .env.local (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  const { data: subjectRow, error: subjErr } = await supabase
    .from("subjects")
    .select("id")
    .eq("name", SUBJECT_NAME)
    .single();

  if (subjErr || !subjectRow) {
    console.error(`Could not find subject "${SUBJECT_NAME}": ${subjErr?.message ?? "not found"}`);
    process.exit(1);
  }
  const subjectId = subjectRow.id;

  const { data: rows, error: qErr } = await supabase
    .from("questions")
    .select("id, literary_work")
    .eq("subject_id", subjectId);

  if (qErr) {
    console.error(`Failed to fetch questions: ${qErr.message}`);
    process.exit(1);
  }

  const countByTitle = new Map();
  let noWork = 0;
  for (const r of rows) {
    const title = r.literary_work?.title?.trim();
    if (!title) { noWork++; continue; }
    countByTitle.set(title, (countByTitle.get(title) ?? 0) + 1);
  }

  console.log(`\n${SUBJECT_NAME}${APPLY ? "" : "  [DRY RUN — pass --apply to write]"}`);
  console.log(`${rows.length} question(s), ${countByTitle.size} distinct literary work(s), ${noWork} with no literary_work.title\n`);

  let updated = 0, failed = 0;

  for (const [title, count] of [...countByTitle.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  "${title}" → chapter — ${count} question(s)`);

    if (APPLY) {
      const { error, count: updatedCount } = await supabase
        .from("questions")
        .update({ chapter: title })
        .eq("subject_id", subjectId)
        .eq("literary_work->>title", title)
        .select("id", { count: "exact", head: true });

      if (error) {
        failed++;
        console.error(`    ❌ update failed: ${error.message}`);
      } else {
        updated += updatedCount ?? count;
      }
    }
  }

  console.log(
    `\n${countByTitle.size} work(s) processed, ${noWork} question(s) left without a chapter (no literary_work.title).` +
    (APPLY ? ` ${updated} row(s) updated${failed ? `, ${failed} work(s) failed` : ""}.` : " Re-run with --apply to write."),
  );
}

main();
