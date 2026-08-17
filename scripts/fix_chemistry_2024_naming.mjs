import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { config } from "dotenv";
config({ path: ".env.local" });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TARGETS = [
  "2(v)(a)(1)", "2(v)(a)(2)",
  "2(v)(b)(1)", "2(v)(b)(2)", "2(v)(b)(3)",
  "7(iv)(a)(1)", "7(iv)(a)(2)",
];

const { data: subject } = await supabase.from("subjects").select("id").ilike("name", "Chemistry").single();
const data = JSON.parse(readFileSync("boardedge-data/chemistry/extracted/ChemPPA-24_marking_scheme.json", "utf-8"));
const entries = data.marking_schemes ?? data.questions;

const norm = (s) => s.replace(/[()]/g, "");

const { data: questions } = await supabase
  .from("questions")
  .select("id, question_number, question_text")
  .eq("subject_id", subject.id)
  .eq("year", 2024);

for (const qNum of TARGETS) {
  const question = questions.find((q) => q.question_number === qNum);
  const entry = entries.find((e) => norm(e.question_number) === norm(qNum));

  if (!question) {
    console.error(`SKIP ${qNum}: no DB row found`);
    continue;
  }
  if (question.question_text && question.question_text.trim()) {
    console.log(`SKIP ${qNum}: already has text`);
    continue;
  }
  if (!entry) {
    console.error(`SKIP ${qNum}: no matching source entry`);
    continue;
  }

  const { error } = await supabase
    .from("questions")
    .update({
      question_text: entry.question_text ?? null,
      is_subjective: entry.is_subjective ?? undefined,
      question_type: entry.question_type ?? null,
      options: entry.options ?? null,
      correct_answer: entry.correct_answer ?? null,
      topic: entry.topic ?? null,
      diagram_required: entry.diagram_required ?? false,
    })
    .eq("id", question.id);

  if (error) {
    console.error(`FAILED ${qNum}: ${error.message}`);
  } else {
    console.log(`UPDATED ${qNum}: "${(entry.question_text || "").slice(0, 60)}..."`);
  }
}
