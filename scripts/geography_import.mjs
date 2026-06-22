/**
 * geography_import.mjs
 * BoardEdge — Load extracted Geography PYQ JSON into Supabase
 *
 * Usage (from Next.js project root):
 *   node scripts/geography_import.mjs <file1.json> [file2.json] ...
 *   node scripts/geography_import.mjs --dry-run <file.json>
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
      // Idempotency check
      const { data: existing, error: lookupErr } = await supabase
        .from('questions')
        .select('id')
        .eq('subject_id', subjectId)
        .eq('year', Number(year))
        .eq('question_number', qNum)
        .maybeSingle();

      if (lookupErr) throw new Error(`Lookup failed: ${lookupErr.message}`);

      if (existing) {
        console.log(`   ⏭   Skip (exists): ${label}`);
        skipped++;
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

if (!args.length) {
  console.log(`
Usage:
  node scripts/geography_import.mjs geography_2024.json
  node scripts/geography_import.mjs geography_2023.json geography_2024.json geography_2025.json
  node scripts/geography_import.mjs --dry-run geography_2024.json
  `);
  process.exit(1);
}

// Resolve Geography subject_id once
const { data: subject, error: subjectErr } = await supabase
  .from('subjects')
  .select('id')
  .ilike('name', 'Geography')
  .single();

if (subjectErr || !subject) {
  console.error(`❌ Geography not found in subjects table. Check subject name casing.`);
  console.error(subjectErr?.message);
  process.exit(1);
}

console.log(`\n🌍 Geography subject_id: ${subject.id}`);

let totalInserted = 0, totalSkipped = 0, totalFailed = 0, totalWarnings = 0;

for (const filePath of args) {
  const result = await importFile(filePath, subject.id);
  totalInserted += result.inserted;
  totalSkipped += result.skipped;
  totalFailed += result.failed;
  totalWarnings += result.warnings;
}

if (args.length > 1) {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`🎯 TOTAL across ${args.length} files:`);
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
