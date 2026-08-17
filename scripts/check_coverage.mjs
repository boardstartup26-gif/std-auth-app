import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

const supabase = createClient(url, key);

const { data: subjects, error: subErr } = await supabase
  .from("subjects")
  .select("id, name, board");
if (subErr) throw subErr;

const PAGE_SIZE = 1000;
const questions = [];
for (let from = 0; ; from += PAGE_SIZE) {
  const { data, error } = await supabase
    .from("questions")
    .select("id, subject_id, year, paper, question_number, question_text, marking_schemes(id, scheme_text, total_marks, model_answer)")
    .range(from, from + PAGE_SIZE - 1);
  if (error) throw error;
  questions.push(...data);
  if (data.length < PAGE_SIZE) break;
}

const subjectMap = Object.fromEntries(subjects.map((s) => [s.id, s.name]));

const groups = {};
for (const q of questions) {
  const subj = subjectMap[q.subject_id] ?? `unknown(${q.subject_id})`;
  const key = `${subj}|${q.year}|${q.paper}`;
  if (!groups[key]) groups[key] = { subject: subj, year: q.year, paper: q.paper, questions: 0, missingScheme: 0, emptySchemeFields: 0, missingQText: 0 };
  groups[key].questions++;
  const scheme = Array.isArray(q.marking_schemes) ? q.marking_schemes[0] : q.marking_schemes;
  if (!scheme) {
    groups[key].missingScheme++;
  } else if (!scheme.scheme_text && !scheme.model_answer && !scheme.total_marks) {
    groups[key].emptySchemeFields++;
  }
  if (!q.question_text || !q.question_text.trim()) {
    groups[key].missingQText++;
  }
}

const rows = Object.values(groups).sort((a, b) =>
  a.subject.localeCompare(b.subject) || a.year - b.year || String(a.paper).localeCompare(String(b.paper))
);

console.log("subject,year,paper,questions,missing_scheme,empty_scheme_fields,missing_question_text");
for (const r of rows) {
  console.log(`${r.subject},${r.year},${r.paper},${r.questions},${r.missingScheme},${r.emptySchemeFields},${r.missingQText}`);
}

const totalQuestions = questions.length;
const totalMissing = rows.reduce((a, r) => a + r.missingScheme, 0);
console.log(`\nTotal questions: ${totalQuestions}`);
console.log(`Total missing marking schemes: ${totalMissing}`);
console.log(`Subjects in DB: ${subjects.map((s) => s.name).join(", ")}`);
