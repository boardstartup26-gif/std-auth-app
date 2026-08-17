import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { config } from "dotenv";
config({ path: ".env.local" });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: subject } = await supabase.from("subjects").select("id").ilike("name", "Chemistry").single();

const PLAN = [
  { year: 2018, staleQNum: "5(a)", file: "boardedge-data/chemistry/extracted/ChemPPA-18_marking_scheme.json", prefix: "5(a)" },
  { year: 2020, staleQNum: "3(a)", file: "boardedge-data/chemistry/extracted/ChemPPA-20_marking_scheme.json", prefix: "3(a)" },
  { year: 2020, staleQNum: "4(b)", file: "boardedge-data/chemistry/extracted/ChemPPA-20_marking_scheme.json", prefix: "4(b)" },
  { year: 2020, staleQNum: "5(b)", file: "boardedge-data/chemistry/extracted/ChemPPA-20_marking_scheme.json", prefix: "5(b)" },
  { year: 2025, staleQNum: "2(iv)", file: "boardedge-data/chemistry/extracted/ChemPPA-25_marking_scheme.json", prefix: "2(iv)" },
];

for (const step of PLAN) {
  console.log(`\n=== ${step.year} ${step.staleQNum} ===`);

  const { data: stale, error: staleErr } = await supabase
    .from("questions")
    .select("id, paper")
    .eq("subject_id", subject.id)
    .eq("year", step.year)
    .eq("question_number", step.staleQNum)
    .maybeSingle();

  if (staleErr) throw staleErr;
  if (!stale) {
    console.log(`  no stale row found, skipping`);
    continue;
  }

  const data = JSON.parse(readFileSync(step.file, "utf-8"));
  const entries = (data.marking_schemes ?? data.questions).filter(
    (e) => e.question_number.startsWith(step.prefix) && e.question_number !== step.staleQNum
  );

  if (entries.length === 0) {
    console.log(`  no sub-part entries found in source, skipping delete for safety`);
    continue;
  }

  // Delete the marking_schemes row for the stale question, then the question itself.
  const { error: delMsErr } = await supabase.from("marking_schemes").delete().eq("question_id", stale.id);
  if (delMsErr) throw delMsErr;
  const { error: delQErr } = await supabase.from("questions").delete().eq("id", stale.id);
  if (delQErr) throw delQErr;
  console.log(`  deleted stale row ${step.staleQNum} (question_id ${stale.id})`);

  for (const entry of entries) {
    const { data: q, error: qErr } = await supabase
      .from("questions")
      .insert({
        subject_id: subject.id,
        year: step.year,
        paper: String(data.paper ?? stale.paper),
        question_number: entry.question_number,
        question_text: entry.question_text ?? null,
        is_subjective: entry.is_subjective ?? true,
        question_type: entry.question_type ?? null,
        options: entry.options ?? null,
        correct_answer: entry.correct_answer ?? null,
        diagram_required: entry.diagram_required ?? false,
        topic: entry.topic ?? null,
      })
      .select("id")
      .single();

    if (qErr) {
      console.error(`  FAILED insert ${entry.question_number}: ${qErr.message}`);
      continue;
    }

    const { error: msErr } = await supabase.from("marking_schemes").insert({
      question_id: q.id,
      scheme_text: entry.scheme_text ?? null,
      total_marks: entry.total_marks ?? entry.marks ?? null,
      key_points: entry.key_points ?? [],
      model_answer: entry.model_answer ?? null,
      model_answer_verified: entry.model_answer_verified ?? true,
      accepted_alternatives: entry.accepted_alternatives ?? [],
      common_errors: entry.common_errors ?? [],
      examiner_notes: entry.examiner_notes ?? null,
      marks_per_correct_point: entry.marks_per_correct_point ?? null,
    });

    if (msErr) {
      console.error(`  FAILED scheme insert ${entry.question_number}: ${msErr.message}`);
    } else {
      console.log(`  inserted ${entry.question_number}`);
    }
  }
}
