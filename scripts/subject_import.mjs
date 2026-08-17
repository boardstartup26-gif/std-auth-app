/**
 * subject_import.mjs
 * BoardEdge — Load extracted PYQ JSON into Supabase for ANY subject.
 * Generalized from geography_import.mjs (was hardcoded to Geography).
 *
 * Usage (from Next.js project root):
 *   node scripts/subject_import.mjs <SubjectName> <file1.json> [file2.json] ...
 *   node scripts/subject_import.mjs Biology bio_2019.json bio_2024.json
 *   node scripts/subject_import.mjs Physics --dry-run phy_2018.json
 *
 * <SubjectName> must exactly match (case-insensitive) a row in `subjects`.
 * If it doesn't exist yet, create it first:
 *   INSERT INTO subjects (name) VALUES ('Biology');
 *
 * Expected JSON format (unified extraction prompt):
 * {
 *   "year": 2024,
 *   "paper": "1",
 *   "marking_schemes": [ { question_number, question_text, ... } ]
 * }
 *
 * Idempotent: skips any (subject_id, year, question_number) that already exists.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config({ path: '.env.local' });

const DRY_RUN = process.argv.includes('--dry-run');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  console.error('   Make sure .env.local is in the same directory you run this from.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Helpers ────────────────────────────────────────────────────────────────

function validateEntry(entry) {
  const required = ['question_number', 'question_text', 'is_subjective', 'question_type', 'total_marks'];
  const missing = required.filter(k => entry[k] === undefined || entry[k] === null || entry[k] === '');
  return missing;
}

// ─── Core import ────────────────────────────────────────────────────────────

async function importFile(jsonPath, subjectId) {
  console.log(`\n📂  Reading: ${jsonPath}`);

  let raw;
  try {
    raw = readFileSync(jsonPath, 'utf-8');
  } catch {
    console.error(`   ❌ Cannot read file: ${jsonPath}`);
    return { inserted: 0, skipped: 0, failed: 0, warnings: 0 };
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    console.error(`   ❌ Invalid JSON in: ${jsonPath}`);
    return { inserted: 0, skipped: 0, failed: 0, warnings: 0 };
  }

  const { year, paper, marking_schemes } = data;

  if (!year || !Array.isArray(marking_schemes) || marking_schemes.length === 0) {
    console.error(`   ❌ JSON missing 'year' or 'marking_schemes' array.`);
    return { inserted: 0, skipped: 0, failed: 0, warnings: 0 };
  }

  if (paper === undefined || paper === null || paper === '') {
    console.error(`   ❌ JSON missing 'paper' (required, NOT NULL in questions table).`);
    return { inserted: 0, skipped: 0, failed: 0, warnings: 0 };
  }

  console.log(`   📅 Year: ${year}  |  Paper: ${paper}  |  Entries: ${marking_schemes.length}${DRY_RUN ? '  [DRY RUN]' : ''}`);

  let inserted = 0, skipped = 0, failed = 0, warnings = 0;

  for (const entry of marking_schemes) {
    const qNum = entry.question_number;
    const label = `${year} Q${qNum}`;

    // Validate
    const missing = validateEntry(entry);
    if (missing.length) {
      console.warn(`   ⚠️   ${label}: missing fields [${missing.join(', ')}] — importing anyway`);
      warnings++;
    }

    try {
      // Idempotency check — a question only counts as "done" if it has BOTH
      // a questions row AND a matching marking_schemes row. A question left
      // orphaned by a marking_schemes insert failure in a prior run must be
      // retried, not silently skipped forever.
      const { data: existing, error: lookupErr } = await supabase
        .from('questions')
        .select('id, marking_schemes(id)')
        .eq('subject_id', subjectId)
        .eq('year', Number(year))
        .eq('question_number', qNum)
        .maybeSingle();

      if (lookupErr) throw new Error(`Lookup failed: ${lookupErr.message}`);

      if (existing && existing.marking_schemes?.length > 0) {
        console.log(`   ⏭   Skip (exists): ${label}`);
        skipped++;
        continue;
      }

      if (existing && (!existing.marking_schemes || existing.marking_schemes.length === 0)) {
        console.warn(`   🔧  ${label}: question exists but marking_scheme is missing — backfilling scheme only`);
        const { error: msErr } = await supabase
          .from('marking_schemes')
          .insert({
            question_id: existing.id,
            scheme_text: entry.scheme_text ?? null,
            total_marks: entry.total_marks ?? null,
            key_points: entry.key_points ?? [],
            model_answer: entry.model_answer ?? null,
            model_answer_verified: entry.model_answer_verified ?? true,
            accepted_alternatives: entry.accepted_alternatives ?? [],
            common_errors: entry.common_errors ?? [],
            examiner_notes: entry.examiner_notes ?? null,
            marks_per_correct_point: entry.marks_per_correct_point ?? null,
          });
        if (msErr) throw new Error(`marking_schemes backfill: ${msErr.message}`);
        console.log(`   ✅  Backfilled scheme: ${label}`);
        inserted++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`   🔍  Would insert: ${label} — "${String(entry.question_text ?? '').slice(0, 60)}..."`);
        inserted++;
        continue;
      }

      // INSERT → questions
      const { data: q, error: qErr } = await supabase
        .from('questions')
        .insert({
          subject_id: subjectId,
          year: Number(year),
          paper: String(paper),
          question_number: qNum,
          question_text: entry.question_text ?? null,
          is_subjective: entry.is_subjective ?? true,
          question_type: entry.question_type ?? null,
          options: entry.options ?? null,
          correct_answer: entry.correct_answer ?? null,
          diagram_required: entry.diagram_required ?? false,
          topic: entry.topic ?? null,
        })
        .select('id')
        .single();

      if (qErr) throw new Error(`questions insert: ${qErr.message}`);

      // INSERT → marking_schemes
      const { error: msErr } = await supabase
        .from('marking_schemes')
        .insert({
          question_id: q.id,
          scheme_text: entry.scheme_text ?? null,
          total_marks: entry.total_marks ?? null,
          key_points: entry.key_points ?? [],
          model_answer: entry.model_answer ?? null,
          model_answer_verified: entry.model_answer_verified ?? true,
          accepted_alternatives: entry.accepted_alternatives ?? [],
          common_errors: entry.common_errors ?? [],
          examiner_notes: entry.examiner_notes ?? null,
          marks_per_correct_point: entry.marks_per_correct_point ?? null,
        });

      if (msErr) throw new Error(`marking_schemes insert: ${msErr.message}`);

      console.log(`   ✅  Inserted: ${label}`);
      inserted++;

    } catch (err) {
      console.error(`   ❌  ${label}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n   📊 Year ${year}: ${inserted} inserted | ${skipped} skipped | ${failed} failed | ${warnings} warnings`);
  return { inserted, skipped, failed, warnings };
}

// ─── Main ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2).filter(a => a !== '--dry-run');

if (args.length < 2) {
  console.log(`
Usage:
  node scripts/subject_import.mjs Biology bio_2019.json
  node scripts/subject_import.mjs Biology bio_2018.json bio_2019.json bio_2024.json
  node scripts/subject_import.mjs Physics --dry-run phy_2024.json
  `);
  process.exit(1);
}

const SUBJECT_NAME = args[0];
const files = args.slice(1);

// Resolve subject_id once
const { data: subject, error: subjectErr } = await supabase
  .from('subjects')
  .select('id')
  .ilike('name', SUBJECT_NAME)
  .single();

if (subjectErr || !subject) {
  console.error(`❌ "${SUBJECT_NAME}" not found in subjects table. Insert it first:`);
  console.error(`   INSERT INTO subjects (name) VALUES ('${SUBJECT_NAME}');`);
  console.error(subjectErr?.message ?? '');
  process.exit(1);
}

console.log(`\n📚 ${SUBJECT_NAME} subject_id: ${subject.id}`);

let totalInserted = 0, totalSkipped = 0, totalFailed = 0, totalWarnings = 0;

for (const filePath of files) {
  const result = await importFile(filePath, subject.id);
  totalInserted += result.inserted;
  totalSkipped += result.skipped;
  totalFailed += result.failed;
  totalWarnings += result.warnings;
}

if (files.length > 1) {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`🎯 TOTAL across ${files.length} files:`);
  console.log(`   Inserted : ${totalInserted}`);
  console.log(`   Skipped  : ${totalSkipped}`);
  console.log(`   Failed   : ${totalFailed}`);
  console.log(`   Warnings : ${totalWarnings}`);
}

if (totalFailed > 0) {
  console.log(`\n⚠️  Some rows failed. Fix errors above and re-run — script is idempotent.`);
  process.exit(1);
}

console.log(`\n✅ Done.`);
