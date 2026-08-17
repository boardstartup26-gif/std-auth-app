import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { config } from "dotenv";
config({ path: ".env.local" });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TARGETS = ["5(a)(i)", "5(a)(ii)", "5(b)(i)", "5(b)(ii)", "6(c)(ii)", "6(c)(iii)"];

const { data: subject } = await supabase.from("subjects").select("id").ilike("name", "Physics").single();
const data = JSON.parse(readFileSync("boardedge-data/physics/extracted/PhyPPA-19_marking_scheme.json", "utf-8"));
const entries = data.marking_schemes ?? data.questions;

const { data: questions } = await supabase
  .from("questions")
  .select("id, question_number, marking_schemes(id)")
  .eq("subject_id", subject.id)
  .eq("year", 2019);

for (const qNum of TARGETS) {
  const entry = entries.find((e) => e.question_number === qNum);
  const question = questions.find((q) => q.question_number === qNum);

  if (!entry || !question) {
    console.error(`SKIP ${qNum}: missing entry or question row`);
    continue;
  }
  if (question.marking_schemes && question.marking_schemes.length > 0) {
    console.log(`SKIP ${qNum}: scheme already exists`);
    continue;
  }

  const { error } = await supabase.from("marking_schemes").insert({
    question_id: question.id,
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

  if (error) {
    console.error(`FAILED ${qNum}: ${error.message}`);
  } else {
    console.log(`INSERTED ${qNum}`);
  }
}
