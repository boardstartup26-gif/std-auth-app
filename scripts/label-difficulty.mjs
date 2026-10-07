// scripts/label-difficulty.mjs
//
// One-off: estimate each question's difficulty (easy / medium / hard) for an
// ICSE Class 10 student, from the question, its official scheme and its marks.
// Writes questions.difficulty_estimate (+ _at, _source). Needs the
// 20261007120000_practice_sets migration.
//
// This is an ESTIMATE, labelled as one everywhere it's shown. The plan is to
// replace it with difficulty derived from real student scores once there are
// enough of them (.agents/product-marketing.md §11b).
//
// Dry run by default: prints the labels and a distribution, writes nothing.
//
//   node scripts/label-difficulty.mjs --limit 40                 # preview 40
//   node scripts/label-difficulty.mjs --subject Biology --limit 40
//   node scripts/label-difficulty.mjs --write                    # label everything unlabelled
//   node scripts/label-difficulty.mjs --write --relabel          # redo all
//
// Cost: ~2,450 questions in batches of 20 is ~125 Sonnet calls, a few US
// dollars in total.

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env.local") });

const MODEL = "claude-sonnet-4-5";
const SOURCE = `${MODEL}:difficulty-v1`;
const BATCH = 25;
const PAGE = 1000;
const MAX_CHARS = 800;

// Spend guard. Cost is metered from the usage the API reports on every call,
// at Sonnet 4.5 list prices ($3 / $15 per million input / output tokens). The
// run stops before any call that could cross the budget, and stops early if
// the first batches project a total above it. Re-running picks up only the
// questions still unlabelled, so a stopped run loses nothing.
const PRICE_IN_PER_M = 3;
const PRICE_OUT_PER_M = 15;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const WRITE = flag("write");
const RELABEL = flag("relabel");
const LIMIT = opt("limit") ? Number(opt("limit")) : Infinity;
const SUBJECT = opt("subject");
const BUDGET_USD = opt("budget") ? Number(opt("budget")) : 1.8;

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You estimate how difficult ICSE Class 10 board-exam questions are for a typical ICSE Class 10 student who has studied the syllabus.

For each question you get the subject, the marks, the question text, and the official CISCE marking scheme. Judge from what the scheme demands for full marks, not from how long the question is.

- easy: recall of a single fact, definition, term, formula or option; one step; marks are rarely lost by a prepared student.
- medium: explain, compare or apply a familiar concept; two or three linked points; a standard one- or two-step numerical; marks are lost mainly through incomplete points.
- hard: multi-step reasoning or calculation, applying a concept to an unfamiliar situation, precise terminology across several scheme points, a reason that must be justified, or a scheme where the exact wording or unit carries marks students commonly miss.

Mark value alone does not decide it: a 1-mark question can be hard and a 4-mark question can be easy.

Calibrate against a whole ICSE paper: across a typical paper roughly 40% of questions are easy, 40% medium and 20% hard for this student. Use that as your sense of scale (a standard textbook numerical a student has practised many times is medium, not hard; "hard" is the part of the paper that separates a 90+ student from an 80 student), but label each question on its own merits and never force a batch to match those proportions.

Reply with JSON only, no prose: an array with exactly one letter per question, in the given order, "e" for easy, "m" for medium, "h" for hard. Example for three questions: ["e","h","m"]`;

async function loadQuestions() {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from("questions")
      .select(
        "id, question_number, year, question_text, subjects!inner ( name ), " +
          "marking_schemes ( scheme_text, total_marks )",
      )
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (SUBJECT) q = q.eq("subjects.name", SUBJECT);
    if (!RELABEL) q = q.is("difficulty_estimate", null);
    const { data, error } = await q;
    if (error) throw new Error(`read failed: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows
    .map((r) => {
      const ms = Array.isArray(r.marking_schemes) ? r.marking_schemes[0] : r.marking_schemes;
      return {
        id: r.id,
        subject: r.subjects?.name,
        label: `${r.year} Q${r.question_number}`,
        text: (r.question_text ?? "").trim(),
        scheme: (ms?.scheme_text ?? "").trim(),
        marks: Number(ms?.total_marks ?? 0),
      };
    })
    .filter((r) => r.text && r.scheme && r.marks > 0)
    .slice(0, LIMIT);
}

async function labelBatch(batch) {
  const body = batch
    .map(
      (q, i) =>
        `### ${i + 1}\nSubject: ${q.subject}\nMarks: ${q.marks}\nQuestion: ${q.text.slice(0, MAX_CHARS)}\nOfficial scheme: ${q.scheme.slice(0, MAX_CHARS)}`,
    )
    .join("\n\n");
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: SYSTEM,
    messages: [{ role: "user", content: body }],
  });
  const cost =
    (msg.usage.input_tokens * PRICE_IN_PER_M + msg.usage.output_tokens * PRICE_OUT_PER_M) / 1_000_000;
  const text = msg.content.find((b) => b.type === "text")?.text ?? "";
  const LEVEL = { e: "easy", m: "medium", h: "hard" };
  let json;
  try {
    json = JSON.parse(text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim());
  } catch {
    json = null;
  }
  if (!Array.isArray(json) || json.length !== batch.length || !json.every((l) => LEVEL[l])) {
    // The call still cost money even though its answer is unusable.
    const err = new Error(`unusable reply (${Array.isArray(json) ? json.length : "not an array"} labels for ${batch.length})`);
    err.cost = cost;
    throw err;
  }
  return { cost, labelled: json.map((l, i) => ({ ...batch[i], difficulty: LEVEL[l] })) };
}

async function main() {
  const questions = await loadQuestions();
  console.log(`${WRITE ? "WRITE" : "DRY RUN"}: ${questions.length} questions to label${SUBJECT ? ` (${SUBJECT})` : ""}.`);

  // Batches stay within one subject, so the model compares like with like.
  const bySubject = new Map();
  for (const q of questions) bySubject.set(q.subject, [...(bySubject.get(q.subject) ?? []), q]);

  const tally = {};
  let failed = 0;
  let spent = 0;
  let calls = 0;
  let done = 0;
  let maxBatchCost = 0;
  let stopped = null;
  outer: for (const [subject, list] of bySubject) {
    for (let i = 0; i < list.length; i += BATCH) {
      // Never start a call that could take the total over budget.
      const nextEstimate = calls ? maxBatchCost * 1.5 : 0.05;
      if (spent + nextEstimate > BUDGET_USD) {
        stopped = `budget: $${spent.toFixed(3)} spent, next call could exceed $${BUDGET_USD}`;
        break outer;
      }
      if (calls === 3 && done > 0 && (spent / done) * questions.length > BUDGET_USD) {
        stopped = `projection: ~$${((spent / done) * questions.length).toFixed(2)} for all ${questions.length} would exceed $${BUDGET_USD}`;
        break outer;
      }
      const batch = list.slice(i, i + BATCH);
      let labelled;
      calls += 1;
      try {
        const res = await labelBatch(batch);
        labelled = res.labelled;
        spent += res.cost;
        maxBatchCost = Math.max(maxBatchCost, res.cost);
      } catch (err) {
        spent += err.cost ?? 0;
        maxBatchCost = Math.max(maxBatchCost, err.cost ?? 0);
        failed += batch.length;
        console.error(`  ${subject} batch ${i / BATCH + 1} failed (skipped): ${err.message}`);
        continue;
      }
      done += labelled.length;
      for (const q of labelled) {
        const key = `${subject} / ${q.difficulty}`;
        tally[key] = (tally[key] ?? 0) + 1;
        if (!WRITE) {
          console.log(`  [${q.difficulty.padEnd(6)}] ${subject} ${q.label} (${q.marks}m): ${q.text.slice(0, 90).replace(/\s+/g, " ")}`);
          continue;
        }
        const { error } = await supabase
          .from("questions")
          .update({
            difficulty_estimate: q.difficulty,
            difficulty_estimated_at: new Date().toISOString(),
            difficulty_estimate_source: SOURCE,
          })
          .eq("id", q.id);
        if (error) {
          failed += 1;
          console.error(`  write failed for ${q.id}: ${error.message}`);
        }
      }
      if (WRITE) console.log(`  ${subject}: ${Math.min(i + BATCH, list.length)}/${list.length}  ($${spent.toFixed(3)} so far)`);
    }
  }

  console.log(`\nCalls: ${calls}. Labelled: ${done}/${questions.length}. Metered cost: $${spent.toFixed(3)} (budget $${BUDGET_USD}).`);
  if (stopped) console.log(`STOPPED EARLY (${stopped}). Re-run to continue with the unlabelled questions.`);
  console.log("\nDistribution:");
  for (const [k, v] of Object.entries(tally).sort()) console.log(`  ${k}: ${v}`);
  if (failed) console.log(`\n${failed} questions not labelled; re-run to retry them (only unlabelled rows are picked up).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
