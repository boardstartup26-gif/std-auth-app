/**
 * reformat-hc-model-answers.ts
 * BoardEdge — one-time backfill: reformat stored History & Civics
 * marking_schemes.model_answer prose into a bulleted list, without
 * changing any factual content.
 *
 * Presentation-layer rewrite only. Does NOT touch the evaluation route,
 * the Claude call at request time, model_answer_verified, key_points,
 * scheme_text, or any other subject.
 *
 * Usage:
 *   node scripts/reformat-hc-model-answers.ts --dry-run
 *   node scripts/reformat-hc-model-answers.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { readFileSync } from "fs";

config({ path: ".env.local" });

const DRY_RUN = process.argv.includes("--dry-run");

const ONLY_IDS_ARG = process.argv.find((a) => a.startsWith("--only-ids="));
const ONLY_IDS: Set<string> | null = ONLY_IDS_ARG
  ? new Set(
      readFileSync(ONLY_IDS_ARG.slice("--only-ids=".length), "utf-8")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    )
  : null;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Missing env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!ANTHROPIC_API_KEY) {
  console.error("❌ Missing env var: ANTHROPIC_API_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ─── Reformat prompt (narrow — structural only, not a grading prompt) ───────

const REFORMAT_SYSTEM_PROMPT = `You restructure exam model-answer text into a numbered list. You do NOT rewrite, grade, add content, or use outside knowledge — even when the input looks incomplete, terse, or like a bare keyword/title.

Rules:
1. Identify each distinct point already expressed in the input prose. Each becomes one numbered point.
2. Each point is one complete, grammatically standalone sentence — no more elaborate than the original prose already was. If a point was already one sentence, keep that sentence as the numbered point unchanged.
3. Do not add new clauses, new justification, new context, new examples, or restated meaning that wasn't in the original text. You may trim an existing redundant trailing clause (one that only restates what the sentence already said), but never add one.
4. Do not add, remove, or alter any fact, name, number, date, or term. Do not supply information from your own knowledge of the subject, even if you know more about the topic than the input states.
5. If the input is a single short phrase, title, or term with no further elaboration (e.g. "Money Bill.", "The President of India."), output it as ONE numbered point, completely unchanged in wording. Do NOT expand it into new sentences or add explanation — that is fabrication, not reformatting, and is strictly forbidden.
6. Output ONLY the numbered list: one point per line, each line starting with a sequential number and period ("1. ", "2. ", "3. ", ...) starting at 1. Never use "•" or any other bullet character. No preamble, no explanation, no markdown code fences.

Example:
Input:
Original Jurisdiction refers to those cases which the High Court has the authority to hear and decide in the first instance, rather than on appeal. Two cases that fall under this jurisdiction are matters relating to wills, divorce, and marriage, and cases involving the enforcement of Fundamental Rights through the issue of writs.

Output:
1. Original Jurisdiction refers to those cases which the High Court has the authority to hear and decide in the first instance, rather than on appeal.
2. Any two cases are :
   1. Matters relating to wills, divorce, and marriage.
   2. Enforcement of Fundamental Rights through the issue of writs.`;

async function reformat(modelAnswer: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 300,
    system: REFORMAT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: modelAnswer }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text content");
  }
  return textBlock.text.trim();
}

// ─── Fact-preservation validation ───────────────────────────────────────────

/**
 * Strips leading list-marker numbering ("1. ", "2. ", indented or not) from
 * the start of each line. These are structural (added by the numbered-list
 * format itself), not content, and must not be compared as facts — otherwise
 * every multi-point row would falsely flag "1", "2", "3" as added facts.
 */
function stripListMarkers(text: string): string {
  return text.replace(/^[ \t]*\d+\.\s+/gm, "");
}

/**
 * Words that surface as capitalized "facts" purely because they open a
 * sentence (quantifiers, demonstrative pronouns) — not proper nouns or
 * named entities, and not worth preserving verbatim when a reformat
 * restates the same count structurally (e.g. via bullet count) instead of
 * spelling it out. Excluded from fact-extraction entirely.
 */
const FACT_STOPLIST = new Set(["this", "two", "three", "four", "any", "one"]);

/**
 * Extracts a rough set of "facts" from text: capitalized/proper-noun-ish
 * phrases and standalone numbers. Deliberately permissive (over-extracts)
 * since a false-positive "missing fact" only routes a row to manual review,
 * never causes a silent overwrite.
 */
function extractFacts(rawText: string): Set<string> {
  const text = stripListMarkers(rawText);
  const facts = new Set<string>();

  // Numbers (years, counts, ages, tenures, etc.)
  for (const m of text.matchAll(/\b\d+(?:\.\d+)?\b/g)) {
    facts.add(m[0]);
  }

  // Capitalized words/phrases (proper nouns, named terms), collapsing
  // runs of consecutive capitalized words into one phrase.
  for (const m of text.matchAll(/\b[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)*\b/g)) {
    const phrase = m[0].trim();
    if (phrase.length > 2 && !FACT_STOPLIST.has(phrase.toLowerCase())) {
      facts.add(phrase);
    }
  }

  return facts;
}

/**
 * Normalizes text to a single line of collapsed whitespace before a
 * substring-presence check, so a fact's presence is judged against the
 * output as one whole string — never scoped to whichever line/bullet the
 * checker happens to be looking at.
 */
function normalizeForScan(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function missingFacts(inputText: string, outputText: string): string[] {
  const inputFacts = extractFacts(inputText);
  const outputScan = normalizeForScan(outputText);
  const missing: string[] = [];

  for (const fact of inputFacts) {
    if (!outputScan.includes(normalizeForScan(fact))) {
      missing.push(fact);
    }
  }
  return missing;
}

/**
 * Facts present in the output but absent from the input — catches
 * fabrication/elaboration beyond the source text (e.g. a terse input like
 * "Money Bill." getting expanded with invented detail).
 */
function addedFacts(inputText: string, outputText: string): string[] {
  const outputFacts = extractFacts(outputText);
  const inputScan = normalizeForScan(inputText);
  const added: string[] = [];

  for (const fact of outputFacts) {
    if (!inputScan.includes(normalizeForScan(fact))) {
      added.push(fact);
    }
  }
  return added;
}

/** Rough word-count guard: a bulleted rewrite should not balloon in length. */
function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ─── Main ────────────────────────────────────────────────────────────────────

type Row = {
  id: string;
  model_answer: string;
  model_answer_verified: boolean;
  question_id: string;
};

async function main() {
  console.log(`\n📚 Reformatting History & Civics model answers${DRY_RUN ? " (DRY RUN)" : ""}\n`);

  const { data: subject, error: subjectErr } = await supabase
    .from("subjects")
    .select("id")
    .eq("name", "History & Civics")
    .single();

  if (subjectErr || !subject) {
    console.error(`❌ Subject "History & Civics" not found: ${subjectErr?.message ?? "no row"}`);
    process.exit(1);
  }

  const { data: questions, error: qErr } = await supabase
    .from("questions")
    .select("id, marking_schemes(id, model_answer, model_answer_verified)")
    .eq("subject_id", subject.id)
    .eq("is_subjective", true);

  if (qErr) {
    console.error(`❌ Failed to fetch questions: ${qErr.message}`);
    process.exit(1);
  }

  const rows: Row[] = [];
  for (const q of questions ?? []) {
    for (const scheme of q.marking_schemes ?? []) {
      if (scheme.model_answer && (!ONLY_IDS || ONLY_IDS.has(scheme.id))) {
        rows.push({
          id: scheme.id,
          model_answer: scheme.model_answer,
          model_answer_verified: scheme.model_answer_verified,
          question_id: q.id,
        });
      }
    }
  }

  console.log(
    `Found ${rows.length} in-scope row(s)${ONLY_IDS ? ` (filtered to ${ONLY_IDS.size} requested id(s))` : ""}.\n`,
  );

  let reformatted = 0;
  let skipped = 0;

  for (const row of rows) {
    let newText: string;
    try {
      newText = await reformat(row.model_answer);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.warn(`⚠ [${row.id}]: SKIPPED — Claude call failed: ${message}`);
      skipped++;
      continue;
    }

    const missing = missingFacts(row.model_answer, newText);
    if (missing.length > 0) {
      console.warn(
        `⚠ [${row.id}]: SKIPPED — fact${missing.length > 1 ? "s" : ""} ${missing
          .slice(0, 5)
          .map((f) => `"${f}"`)
          .join(", ")} missing from output, needs manual review`,
      );
      skipped++;
      continue;
    }

    const added = addedFacts(row.model_answer, newText);
    if (added.length > 0) {
      console.warn(
        `⚠ [${row.id}]: SKIPPED — output introduces new fact${added.length > 1 ? "s" : ""} not in input: ${added
          .slice(0, 5)
          .map((f) => `"${f}"`)
          .join(", ")}, needs manual review`,
      );
      skipped++;
      continue;
    }

    const inputWords = wordCount(row.model_answer);
    const outputWords = wordCount(newText);
    if (outputWords > inputWords * 2 + 10) {
      console.warn(
        `⚠ [${row.id}]: SKIPPED — output (${outputWords} words) is far longer than input (${inputWords} words), likely padded, needs manual review`,
      );
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`✓ [${row.id}]: would reformat`);
      console.log(`  --- OLD ---\n  ${row.model_answer.replace(/\n/g, "\n  ")}`);
      console.log(`  --- NEW ---\n  ${newText.replace(/\n/g, "\n  ")}\n`);
      reformatted++;
      continue;
    }

    const { error: updateErr } = await supabase
      .from("marking_schemes")
      .update({ model_answer: newText })
      .eq("id", row.id);

    if (updateErr) {
      console.warn(`⚠ [${row.id}]: SKIPPED — update failed: ${updateErr.message}`);
      skipped++;
      continue;
    }

    console.log(`✓ [${row.id}]: reformatted, fact check passed`);
    reformatted++;
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log(`Reformatted: ${reformatted} / ${rows.length}`);
  console.log(`Skipped for manual review: ${skipped}`);
  if (DRY_RUN) console.log(`\n(dry run — nothing was written)`);
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
