/**
 * rederive_diagram_flag.mjs
 * BoardEdge — Re-derive `diagram_required` from what each question actually says,
 *             and diff it against the stored flag.
 *
 * The stored flag came from the same LLM pass that wrote the marking-scheme JSON
 * and is unreliable in both directions: 57 questions that plainly reference a
 * figure carry false, and some that carry true never mention one.
 *
 * READ-ONLY by default. Writes nothing unless --apply is passed, and --apply is
 * meant to be run only after the diff below has been approved.
 *
 * Usage (from project root):
 *   node scripts/rederive_diagram_flag.mjs            # print diff + write report
 *   node scripts/rederive_diagram_flag.mjs --apply    # write approved changes
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";
import { config } from "dotenv";

config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Signals ────────────────────────────────────────────────────────────────

// The question cannot be answered without looking at a figure that is printed
// on the paper. Phrased as "the figure exists and you must consult it".
const REFERENCES_FIGURE = [
  /given (below|above) (is|are)[^.]{0,40}\b(picture|diagram|figure|graph|map|sketch|circuit|structure|table)\b/i,
  /\b(study|observe|refer to|look at|examine)\b[^.]{0,30}\b(picture|diagram|figure|graph|map|extract|table|circuit|sketch)\b/i,
  /\b(shown|given|illustrated|depicted)\b[^.]{0,20}\b(below|above|alongside|here)\b/i,
  /\bas shown\b/i,
  /\bin the (given|above|following|adjoining|accompanying) \w{0,12}\s?(diagram|figure|picture|graph|circuit|map|sketch|structure)\b/i,
  /\bthe (diagram|figure|graph|circuit|picture|map|sketch|structure)s? (below|above|given|shown|shows|show)\b/i,
  /\b(picture|diagram|figure|graph|circuit|map|sketch)s? given (below|above)\b/i,
  /\bfrom the (graph|diagram|figure|map|circuit|table)\b/i,
  /\bfollowing (diagram|figure|circuit|graph|picture|structure)\b/i,
  /\bmap extract\b/i,
  /\bin the figure\b/i,
];

// The student is asked to produce a drawing. Still figure-related, and still
// worth showing the source figure for context, but a different kind of task.
const ASKS_FOR_DRAWING = [
  /\b(draw|sketch|plot)\b/i,
  // "copy and complete" only counts when what's being copied is a printed
  // object. "Copy and complete the following paragraph" is a fill-in-the-blank
  // whose text is already in the question — no figure involved.
  /\bcopy\b[^.]{0,30}\b(diagram|figure|circuit|table|structure|map|ray)\b/i,
  /\bcomplete the (diagram|figure|circuit|ray|path|table)\b/i,
  /\b(shade|mark|label) and (label|name|shade|mark)\b/i,
  /\bon the outline map\b/i,
  /\btrace\b/i,
];

function derive(text) {
  if (!text) return { required: false, reasons: [] };
  const reasons = [];

  for (const re of REFERENCES_FIGURE) {
    if (re.test(text)) { reasons.push("references a printed figure"); break; }
  }
  for (const re of ASKS_FOR_DRAWING) {
    if (re.test(text)) { reasons.push("asks the student to draw"); break; }
  }

  return { required: reasons.length > 0, reasons };
}

// ICSE sub-parts share one printed figure: 6(iii)(a) names the diagram and
// 6(iii)(b) then says "among these…". Judging (b) on its own text alone would
// strip a figure it genuinely needs, so siblings under the same parent inherit.
// Only applied at two-or-more bracket levels — at one level, "2(a)" through
// "2(j)" are usually ten unrelated one-markers, not parts of one question.
function bracketDepth(qn) {
  return (qn.match(/\([^()]*\)/g) || []).length;
}

function parentStem(qn) {
  let s = qn.replace(/\.\d+$/, "");
  s = s.replace(/\([^()]*\)$/, "");
  return s || qn;
}

function snippet(text, n = 110) {
  const t = (text || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const { data: subjects } = await supabase.from("subjects").select("id, name");
  const nameById = Object.fromEntries((subjects ?? []).map((s) => [s.id, s.name]));

  // Page through everything — the table is larger than one default page.
  let rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("questions")
      .select("id, subject_id, year, question_number, question_text, question_type, diagram_required, diagram_url")
      .range(from, from + PAGE - 1);
    if (error) { console.error("Fetch failed:", error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    rows = rows.concat(data);
    if (data.length < PAGE) break;
  }

  // Pass 1 — figure references found in each question's own text, collected
  // per parent so siblings can inherit.
  const groupHasFigure = new Set();
  for (const r of rows) {
    if (bracketDepth(r.question_number) < 2) continue;
    if (!derive(r.question_text).required) continue;
    groupHasFigure.add(`${r.subject_id}|${r.year}|${parentStem(r.question_number)}`);
  }

  const turnOn = [];   // stored false → derived true  (missing figures)
  const turnOff = [];  // stored true  → derived false (probably over-flagged)
  const heldBack = []; // derived false, but not safe to turn off
  let agree = 0;

  for (const r of rows) {
    const own = derive(r.question_text);
    const inherited =
      bracketDepth(r.question_number) >= 2 &&
      groupHasFigure.has(`${r.subject_id}|${r.year}|${parentStem(r.question_number)}`);

    const d = {
      required: own.required || inherited,
      reasons: own.reasons.length ? own.reasons : inherited ? ["shares a figure with its sibling parts"] : [],
    };
    const stored = Boolean(r.diagram_required);
    const entry = {
      subject: nameById[r.subject_id] ?? "?",
      year: r.year,
      q: r.question_number,
      type: r.question_type,
      hasUrl: Boolean(r.diagram_url),
      reasons: d.reasons,
      text: snippet(r.question_text),
    };
    if (d.required && !stored) {
      // Split by how much the evidence is worth. A question whose own text
      // names a figure is near-certain. One that only inherited from a sibling
      // is a guess — ICSE sub-parts mix figure questions with plain
      // definitions ("Explain the term 'Guttation'"), and a wrong flag here
      // BLOCKS an answerable question, since diagram_required with no image
      // disables the answer box. Those go to review, not straight in.
      entry.confidence = own.required ? "high" : "review";
      turnOn.push(entry);
    } else if (!d.required && stored) {
      // A question that already has a working figure is proof the flag was
      // right, whatever its wording. Never strip that on the say-so of a regex.
      if (r.diagram_url) heldBack.push(entry);
      else turnOff.push(entry);
    } else {
      agree++;
    }
  }

  const bySubject = (list) => {
    const m = {};
    for (const e of list) m[e.subject] = (m[e.subject] ?? 0) + 1;
    return m;
  };

  console.log("\n═══ DIAGRAM FLAG — PROPOSED DIFF (nothing written) ═══\n");
  console.log(`Questions examined      : ${rows.length}`);
  console.log(`Flag already correct    : ${agree}`);
  const confident = turnOn.filter((e) => e.confidence === "high");
  const review = turnOn.filter((e) => e.confidence === "review");

  console.log(`Turn ON, own text names a figure : ${confident.length}   ${JSON.stringify(bySubject(confident))}`);
  console.log(`Turn ON, inherited only (review) : ${review.length}   ${JSON.stringify(bySubject(review))}`);
  console.log(`Would turn OFF (true→false) : ${turnOff.length}   ${JSON.stringify(bySubject(turnOff))}`);
  console.log(`Held back (has a figure already, left alone) : ${heldBack.length}`);

  console.log("\n─── Sample: turn ON, high confidence ───");
  for (const e of confident.slice(0, 8)) {
    console.log(`  ${e.subject} ${e.year} Q${e.q} [${e.type}]`);
    console.log(`    "${e.text}"`);
  }

  console.log("\n─── Sample: turn ON, needs your eye (inherited only) ───");
  for (const e of review.slice(0, 8)) {
    console.log(`  ${e.subject} ${e.year} Q${e.q} [${e.type}]`);
    console.log(`    "${e.text}"`);
  }

  console.log("\n─── Sample: would turn OFF (flagged, but text names no figure) ───");
  for (const e of turnOff.slice(0, 12)) {
    console.log(`  ${e.subject} ${e.year} Q${e.q} [${e.type}] hasImage=${e.hasUrl}`);
    console.log(`    "${e.text}"`);
  }

  const report = { generatedAt: new Date().toISOString(), examined: rows.length, agree, turnOn, turnOff, heldBack };
  writeFileSync("diagram-flag-diff.json", JSON.stringify(report, null, 2));
  console.log("\nFull diff written to diagram-flag-diff.json");

  if (!APPLY) {
    console.log("\nNothing was written. Re-run with --apply once this diff is approved.\n");
    return;
  }

  console.log("\nApplying…");
  // --apply writes the high-confidence set only. The review set needs
  // --include-review, so it can never go in by accident.
  const onSet = process.argv.includes("--include-review") ? turnOn : confident;
  console.log(`  turning on: ${onSet.length}  turning off: ${turnOff.length}`);
  let ok = 0;
  for (const [list, value] of [[onSet, true], [turnOff, false]]) {
    for (const e of list) {
      const subjectId = Object.keys(nameById).find((k) => nameById[k] === e.subject);
      const { error } = await supabase
        .from("questions")
        .update({ diagram_required: value })
        .eq("subject_id", subjectId)
        .eq("year", e.year)
        .eq("question_number", e.q);
      if (error) console.error(`  ✗ ${e.subject} ${e.year} Q${e.q}: ${error.message}`);
      else ok++;
    }
  }
  console.log(`Applied ${ok} changes.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
