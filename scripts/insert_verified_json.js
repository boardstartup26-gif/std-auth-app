// insert_verified_json.js
require('dotenv').config({ path: '.env.local' });

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EXTRACTED_DIR = path.join(__dirname, '../boardedge-data/chemistry/extracted');
const SUBJECT_NAME = 'Chemistry';

async function getChemistrySubjectId() {
  const { data, error } = await supabase
    .from('subjects')
    .select('id')
    .eq('name', SUBJECT_NAME)
    .single();

  if (error || !data) {
    throw new Error(`Could not find subject "${SUBJECT_NAME}": ${error?.message}`);
  }
  return data.id;
}

async function insertQuestion(subjectId, year, paper, questionNumber, questionText) {
  const { data: existing } = await supabase
    .from('questions')
    .select('id')
    .eq('subject_id', subjectId)
    .eq('year', year)
    .eq('paper', paper)
    .eq('question_number', questionNumber)
    .single();

  if (existing) return { id: existing.id, skipped: true };

  const { data, error } = await supabase
    .from('questions')
    .insert({
      subject_id: subjectId,
      year: parseInt(year),
      paper: paper,
      question_number: questionNumber,
      question_text: questionText,
      topic_id: null,
    })
    .select('id')
    .single();

  if (error) throw new Error(`questions insert failed [Q${questionNumber} ${year}]: ${error.message}`);
  return { id: data.id, skipped: false };
}

async function insertMarkingScheme(questionId, scheme) {
  const { data: existing } = await supabase
    .from('marking_schemes')
    .select('id')
    .eq('question_id', questionId)
    .single();

  if (existing) return { skipped: true };

  const { error } = await supabase
    .from('marking_schemes')
    .insert({
      question_id: questionId,
      scheme_text: scheme.scheme_text || '',
      total_marks: parseInt(scheme.total_marks) || 0,
      key_points: scheme.key_points || [],
      model_answer: scheme.model_answer || '',
      model_answer_verified: true,
      accepted_alternatives: scheme.accepted_alternatives || [],
      common_errors: scheme.common_errors || [],
      examiner_notes: scheme.examiner_notes || '',
    });

  if (error) throw new Error(`marking_schemes insert failed [question_id: ${questionId}]: ${error.message}`);
  return { skipped: false };
}

async function processFile(filePath, subjectId) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw);

  const year = parsed.year;
  const paper = parsed.paper || '1';
  const schemes = parsed.marking_schemes;

  if (!year || !Array.isArray(schemes)) {
    throw new Error(`Invalid JSON structure in ${filePath} — missing "year" or "marking_schemes" array`);
  }

  console.log(`\n📄 Processing ${path.basename(filePath)} — Year: ${year}, Questions: ${schemes.length}`);

  let inserted = 0, skipped = 0, errors = 0;

  for (const scheme of schemes) {
    const qNum = scheme.question_number;
    try {
      const { id: questionId, skipped: qSkipped } = await insertQuestion(
        subjectId, year, paper, qNum, scheme.question_text || ''
      );
      const { skipped: msSkipped } = await insertMarkingScheme(questionId, scheme);

      if (qSkipped || msSkipped) {
        console.log(`  ⏭  Skipped (duplicate): Q${qNum}`);
        skipped++;
      } else {
        console.log(`  ✅ Inserted: Q${qNum}`);
        inserted++;
      }
    } catch (err) {
      console.error(`  ❌ Error on Q${qNum}: ${err.message}`);
      errors++;
    }
  }

  return { inserted, skipped, errors };
}

async function main() {
  console.log('🚀 BoardEdge — Chemistry Data Insertion Script');
  console.log('================================================');

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing env vars in .env.local');
  }

  const subjectId = await getChemistrySubjectId();
  console.log(`✅ Chemistry subject_id: ${subjectId}`);

  const files = fs.readdirSync(EXTRACTED_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(EXTRACTED_DIR, f))
    .sort();

  if (files.length === 0) throw new Error(`No JSON files found in ${EXTRACTED_DIR}`);

  console.log(`📁 Found ${files.length} JSON file(s): ${files.map(f => path.basename(f)).join(', ')}`);

  let totalInserted = 0, totalSkipped = 0, totalErrors = 0;

  for (const file of files) {
    const { inserted, skipped, errors } = await processFile(file, subjectId);
    totalInserted += inserted;
    totalSkipped += skipped;
    totalErrors += errors;
  }

  console.log('\n================================================');
  console.log('📊 Final Summary:');
  console.log(`   ✅ Inserted: ${totalInserted} questions`);
  console.log(`   ⏭  Skipped:  ${totalSkipped} duplicates`);
  console.log(`   ❌ Errors:   ${totalErrors}`);
  console.log('================================================');

  if (totalErrors > 0) {
    console.log('⚠️  Some rows failed — check errors above.');
  } else {
    console.log('🎉 Done. Verify counts in Supabase Table Editor.');
  }
}

main().catch(err => {
  console.error('\n🔴 Fatal error:', err.message);
  process.exit(1);
});