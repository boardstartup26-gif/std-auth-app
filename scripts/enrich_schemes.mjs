/**
 * enrich_schemes.mjs
 * BoardEdge — Patch common_errors and examiner_notes into existing
 * marking_schemes rows from Claude's enrichment JSON output.
 *
 * Usage:
 *   node scripts/enrich_schemes.mjs Biology 2020 ./enrichment_output.json
 *
 * enrichment_output.json = merged JSON array from all Claude enrichment passes:
 * [
 *   { "question_number": "1(a)(i)", "common_errors": [...], "examiner_notes": "..." },
 *   ...
 * ]
 *
 * Idempotent — safe to re-run. Only patches rows where common_errors is empty/null.
 * Pass --force to overwrite even non-empty rows.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config({ path: '.env.local' });

const FORCE = process.argv.includes('--force');
const args = process.argv.slice(2).filter(a => a !== '--force');

if (args.length !== 3) {
  console.error('Usage: node scripts/enrich_schemes.mjs <Subject> <Year> <enrichment.json>');
  console.error('  e.g. node scripts/enrich_schemes.mjs Biology 2020 ./enrichment_output.json');
  process.exit(1);
}

const [SUBJECT_NAME, YEAR_STR, FILE] = args;
const YEAR = parseInt(YEAR_STR, 10);

if (isNaN(YEAR)) {
  console.error(`❌ Invalid year: ${YEAR_STR}`);
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Load enrichment JSON ────────────────────────────────────────────────────

let enrichmentData;
try {
  enrichmentData = JSON.parse(readFileSync(FILE, 'utf-8'));
} catch (err) {
  console.error(`❌ Cannot read/parse enrichment file: ${err.message}`);
  process.exit(1);
}

if (!Array.isArray(enrichmentData) || enrichmentData.length === 0) {
  console.error('❌ Enrichment file must be a non-empty JSON array.');
  process.exit(1);
}

console.log(`\n📚 ${SUBJECT_NAME} ${YEAR} — ${enrichmentData.length} entries in enrichment file`);
if (FORCE) console.log('   ⚠️  --force: will overwrite existing non-empty common_errors');

// ─── Fetch all matching questions + scheme IDs ───────────────────────────────

const { data: questions, error: qErr } = await supabase
  .from('questions')
  .select('id, question_number, marking_schemes(id, common_errors)')
  .eq('year', YEAR)
  .eq('subject_id',
    // Subquery: resolve subject_id from name
    (await supabase
      .from('subjects')
      .select('id')
      .ilike('name', SUBJECT_NAME)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          console.error(`❌ Subject "${SUBJECT_NAME}" not found.`);
          process.exit(1);
        }
        return data.id;
      })
    )
  );

if (qErr) {
  console.error(`❌ Failed to fetch questions: ${qErr.message}`);
  process.exit(1);
}

// Build lookup: question_number → { questionId, schemeId, existingErrors }
const lookup = {};
for (const q of questions) {
  const scheme = q.marking_schemes?.[0];
  if (!scheme) {
    console.warn(`   ⚠️  No marking_scheme row found for Q${q.question_number} — skipping`);
    continue;
  }
  lookup[q.question_number] = {
    schemeId: scheme.id,
    hasExistingErrors: Array.isArray(scheme.common_errors) && scheme.common_errors.length > 0,
  };
}

// ─── Patch loop ──────────────────────────────────────────────────────────────

let patched = 0, skipped = 0, notFound = 0, failed = 0;

for (const entry of enrichmentData) {
  const qNum = entry.question_number;

  if (!qNum) {
    console.warn('   ⚠️  Entry missing question_number — skipping');
    skipped++;
    continue;
  }

  const row = lookup[qNum];
  if (!row) {
    console.warn(`   ⚠️  Q${qNum}: not found in DB for ${SUBJECT_NAME} ${YEAR}`);
    notFound++;
    continue;
  }

  if (row.hasExistingErrors && !FORCE) {
    console.log(`   ⏭   Q${qNum}: already has common_errors — skipping (use --force to overwrite)`);
    skipped++;
    continue;
  }

  const { error: updateErr } = await supabase
    .from('marking_schemes')
    .update({
      common_errors: entry.common_errors ?? [],
      examiner_notes: entry.examiner_notes ?? null,
    })
    .eq('id', row.schemeId);

  if (updateErr) {
    console.error(`   ❌  Q${qNum}: ${updateErr.message}`);
    failed++;
    continue;
  }

  console.log(`   ✅  Q${qNum}: patched`);
  patched++;
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`📊 ${SUBJECT_NAME} ${YEAR} enrichment complete:`);
console.log(`   Patched   : ${patched}`);
console.log(`   Skipped   : ${skipped}`);
console.log(`   Not found : ${notFound}`);
console.log(`   Failed    : ${failed}`);

if (notFound > 0) {
  console.log(`\n   ⚠️  ${notFound} enrichment entries had no matching DB question.`);
  console.log(`      Check question_number format matches exactly (e.g. "1(a)(i)" not "1a(i)").`);
}

if (failed > 0) {
  console.log(`\n   ❌ Some patches failed — re-run is safe, script is idempotent.`);
  process.exit(1);
}

console.log(`\n✅ Done.`);
