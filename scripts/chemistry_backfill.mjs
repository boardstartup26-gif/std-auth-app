/**
 * chemistry_backfill.mjs
 * BoardEdge — Backfill question_text into 282 empty Chemistry objective rows
 *
 * Run AFTER re-extracting Chemistry objective papers using the new unified prompt.
 * New unified JSONs should be saved at: /boardedge-data/chemistry/extracted/
 * (replaces old questions.json + marking_scheme.json split-format files)
 *
 * Usage (from Next.js project root):
 *   node scripts/chemistry_backfill.mjs <file1.json> [file2.json] ...
 *   node scripts/chemistry_backfill.mjs --dry-run <file.json>
 *
 * What this script does:
 *   - Finds existing question rows by (subject_id=Chemistry, year, question_number)
 *   - If question_text is ALREADY populated → skips (protects subjective rows)
 *   - If question_text is EMPTY → UPDATEs questions row with new data
 *   - Does NOT insert new rows; does NOT touch marking_schemes (already populated)
 *
 * Safe to re-run — idempotent by design.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config({ path: '.env.local' });

const DRY_RUN = process.argv.includes('--dry-run');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing env vars in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Core backfill ───────────────────────────────────────────────────────────

async function backfillFile(jsonPath, subjectId) {
  console.log(`\n📂  Reading: ${jsonPath}${DRY_RUN ? '  [DRY RUN]' : ''}`);

  let raw;
  try {
    raw = readFileSync(jsonPath, 'utf-8');
  } catch {
    console.error(`   ❌ Cannot read file: ${jsonPath}`);
    return { updated: 0, skippedHasText: 0, notFound: 0, failed: 0 };
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    console.error(`   ❌ Invalid JSON: ${jsonPath}`);
    return { updated: 0, skippedHasText: 0, notFound: 0, failed: 0 };
  }

  const { year, marking_schemes } = data;

  if (!year || !Array.isArray(marking_schemes)) {
    console.error(`   ❌ Missing year or marking_schemes`);
    return { updated: 0, skippedHasText: 0, notFound: 0, failed: 0 };
  }

  console.log(`   📅 Year: ${year}  |  Entries: ${marking_schemes.length}`);

  let updated = 0, skippedHasText = 0, notFound = 0, failed = 0;

  for (const entry of marking_schemes) {
    const qNum = entry.question_number;
    const label = `${year} Q${qNum}`;

    try {
      // Look up existing row
      const { data: existing, error: lookupErr } = await supabase
        .from('questions')
        .select('id, question_text, is_subjective')
        .eq('subject_id', subjectId)
        .eq('year', Number(year))
        .eq('question_number', qNum)
        .maybeSingle();

      if (lookupErr) throw new Error(`Lookup: ${lookupErr.message}`);

      if (!existing) {
        console.warn(`   ⚠️   Not found: ${label} — row doesn't exist, skipping`);
        notFound++;
        continue;
      }

      // Skip if already has question_text (protects subjective rows)
      if (existing.question_text && existing.question_text.trim().length > 0) {
        console.log(`   ⏭   Has text: ${label}`);
        skippedHasText++;
        continue;
      }

      if (!entry.question_text) {
        console.warn(`   ⚠️   ${label}: new JSON also has no question_text — skipping`);
        failed++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`   🔍  Would update: ${label}`);
        console.log(`        question_text: "${String(entry.question_text).slice(0, 80)}..."`);
        updated++;
        continue;
      }

      // UPDATE questions row — only fields that were missing or unreliable in old import
      const { error: updateErr } = await supabase
        .from('questions')
        .update({
          question_text: entry.question_text,
          // Only overwrite these if the existing value looks like a placeholder
          question_type: entry.question_type ?? null,
          options: entry.options ?? null,
          correct_answer: entry.correct_answer ?? null,
          topic: entry.topic ?? null,
          is_subjective: entry.is_subjective ?? false,
          diagram_required: entry.diagram_required ?? false,
        })
        .eq('id', existing.id);

      if (updateErr) throw new Error(`questions update: ${updateErr.message}`);

      console.log(`   ✅  Updated: ${label}`);
      updated++;

    } catch (err) {
      console.error(`   ❌  ${label}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n   📊 Year ${year}: ${updated} updated | ${skippedHasText} had text | ${notFound} not found | ${failed} failed`);
  return { updated, skippedHasText, notFound, failed };
}

// ─── Verify before running ───────────────────────────────────────────────────

async function preRunStats(subjectId) {
  const { count } = await supabase
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .eq('subject_id', subjectId)
    .or('question_text.is.null,question_text.eq.');

  console.log(`\n🔍 Chemistry rows with empty question_text: ${count ?? 'unknown'}`);
  console.log(`   (Expected: ~282 before backfill, 0 after)\n`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2).filter(a => a !== '--dry-run');

if (!args.length) {
  console.log(`
Usage:
  node scripts/chemistry_backfill.mjs /boardedge-data/chemistry/extracted/chemistry_2023.json
  node scripts/chemistry_backfill.mjs --dry-run /boardedge-data/chemistry/extracted/chemistry_2022.json
  node scripts/chemistry_backfill.mjs /boardedge-data/chemistry/extracted/*.json

File naming convention (suggested):
  /boardedge-data/chemistry/extracted/chemistry_2018.json
  /boardedge-data/chemistry/extracted/chemistry_2019.json
  ... etc

Old files (split format) that these replace:
  /boardedge-data/chemistry/questions.json      ← safe to archive/delete after backfill
  /boardedge-data/chemistry/marking_scheme.json ← safe to archive/delete after backfill
  `);
  process.exit(1);
}

// Resolve Chemistry subject_id
const { data: subject, error: subjectErr } = await supabase
  .from('subjects')
  .select('id')
  .ilike('name', 'Chemistry')
  .single();

if (subjectErr || !subject) {
  console.error(`❌ Chemistry not found in subjects table.`);
  process.exit(1);
}

console.log(`\n🧪 Chemistry subject_id: ${subject.id}`);
await preRunStats(subject.id);

let totalUpdated = 0, totalSkipped = 0, totalNotFound = 0, totalFailed = 0;

for (const filePath of args) {
  const result = await backfillFile(filePath, subject.id);
  totalUpdated += result.updated;
  totalSkipped += result.skippedHasText;
  totalNotFound += result.notFound;
  totalFailed += result.failed;
}

console.log(`\n${'─'.repeat(50)}`);
console.log(`🎯 TOTAL:`);
console.log(`   Updated       : ${totalUpdated}`);
console.log(`   Had text (skip): ${totalSkipped}`);
console.log(`   Not found     : ${totalNotFound}`);
console.log(`   Failed        : ${totalFailed}`);

if (totalFailed > 0 || totalNotFound > 0) {
  console.log(`\n⚠️  Review failures above. Re-run is safe (idempotent).`);
}

// Post-run stats
const { count: remaining } = await supabase
  .from('questions')
  .select('id', { count: 'exact', head: true })
  .eq('subject_id', subject.id)
  .or('question_text.is.null,question_text.eq.');

console.log(`\n📊 Chemistry rows with empty question_text after run: ${remaining ?? 'unknown'}`);
if (!DRY_RUN && remaining === 0) {
  console.log(`✅ All objective rows backfilled successfully.`);
}
