/**
 * sync_diagram_figures.mjs
 * BoardEdge — Make the database's diagram state match the screenshots on disk.
 *
 * This replaces the earlier PDF vision-extraction pipeline (extract_diagrams.mjs),
 * which was abandoned: it cropped from PDFs that interleave the question paper
 * with the marking scheme, so some crops showed the answer diagram.
 *
 * Every question ends up in exactly one of four states, recorded in
 * `diagram_source`:
 *
 *   'figure'        a screenshot exists; it renders inline and the question is
 *                   answerable.
 *   'physical_map'  depends on a Survey of India topographic map extract. Those
 *                   sheets aren't publicly available, so no image can be stored
 *                   and the student is pointed at their physical map sheet.
 *                   Still answerable.
 *   'ocr_pending'   the student is asked to DRAW. Blocked until handwriting
 *                   recognition exists. Keeps its figure (if one was captured)
 *                   so the question still reads sensibly.
 *   null            needs no figure.
 *
 * Precedence is ocr_pending > physical_map > figure: a draw-type question is
 * blocked no matter what else is true of it.
 *
 * Idempotent — safe to re-run. READ-ONLY unless --apply is passed.
 *
 * Usage (from project root):
 *   node scripts/sync_diagram_figures.mjs                  # dry run
 *   node scripts/sync_diagram_figures.mjs --apply          # write
 *   node scripts/sync_diagram_figures.mjs --apply --reset  # wipe storage first
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { readdirSync, existsSync, readFileSync } from "fs";

config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const RESET = process.argv.includes("--reset");
const BUCKET = "question-diagrams";
const SUBJECTS = ["biology", "chemistry", "geography", "physics"];

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Question-number matching ───────────────────────────────────────────────

// Split a question number into comparable segments:
//   "2(v)(b)1"    -> ["2","v","b","1"]
//   "8(iii)(a).2" -> ["8","iii","a","2"]
// A filename "q2-v-b-1.png" reduces to the same shape.
//
// Segments must be compared element-wise, NEVER as a flat string prefix:
// "2(i)" flattens to "2i", which is a string prefix of "2(ii)" -> "2ii". A
// naive prefix match writes one figure onto three unrelated sub-questions.
const segsOf = (s) => (s.match(/[a-z]+|\d+/gi) || []).map((x) => x.toLowerCase());
const segsQN = (qn) => segsOf(qn);
const segsFile = (f) => segsOf(f.replace(/\.png$/i, "").replace(/^q/i, ""));

// A screenshot taken for stem S covers question Q when S's segments are an
// exact element-wise prefix of Q's — i.e. Q is S or a descendant of it. ICSE
// sub-parts share one printed figure, so this fan-out is intended.
const covers = (stem, qn) => stem.length <= qn.length && stem.every((s, i) => s === qn[i]);

// ─── Classification ─────────────────────────────────────────────────────────

// Survey of India topographic sheets. Not publicly available, so these can
// never get an image however hard we try — they get a pointer to the physical
// sheet instead.
const MAP_RE = /survey of india map|map extract|map sheet/i;

// "given below" that points at inline text rather than a printed figure. These
// were flagged diagram_required by the text-pattern pass and are false
// positives: the "below" is the answer options, an equation, or a table that
// already lives in question_text.
const TEXT_NOT_FIGURE = [
  /options given below/i,
  /from (each of )?the four options/i,
  /answer from the (four )?options/i,
  /given below (are|is) (four|two|three|the following) (ions|elements|sets|compounds|statements|substances|options)/i,
  /equation given below/i,
  /as given below:\s*[A-Z0-9]/,
  /as shown below\.\s*[A-Z0-9]/,
  /in the reaction given below/i,
  /data given below/i,
  /complete the table for/i,
  /from the list given below/i,
];
const looksTextual = (t) => TEXT_NOT_FIGURE.some((re) => re.test(t || ""));

// ─── Storage helpers ────────────────────────────────────────────────────────

async function listAllObjects(prefix = "") {
  const out = [];
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw new Error(`list ${prefix}: ${error.message}`);
  for (const entry of data ?? []) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    // Storage has no real directories; an entry with no id is a synthetic
    // folder node and has to be walked rather than deleted.
    if (entry.id === null) out.push(...(await listAllObjects(path)));
    else out.push(path);
  }
  return out;
}

function publicUrl(path) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n═══ DIAGRAM SYNC ${APPLY ? "(APPLYING)" : "(dry run — nothing written)"} ═══\n`);

  const { data: subjectRows } = await supabase.from("subjects").select("id, name");
  const idByName = Object.fromEntries((subjectRows ?? []).map((s) => [s.name.toLowerCase(), s.id]));

  let rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("questions")
      .select("id, subject_id, year, question_number, question_text, question_type, diagram_required, diagram_url, diagram_source")
      .range(from, from + 999);
    if (error) { console.error("Fetch failed:", error.message); process.exit(1); }
    if (!data?.length) break;
    rows = rows.concat(data);
    if (data.length < 1000) break;
  }
  console.log(`Questions loaded: ${rows.length}`);

  // ── Phase A — wipe the old auto-extracted corpus ──────────────────────────
  if (RESET) {
    const objects = await listAllObjects();
    const withUrl = rows.filter((r) => r.diagram_url).length;
    console.log(`\n── Phase A: reset ──`);
    console.log(`  storage objects to delete : ${objects.length}`);
    console.log(`  rows to clear diagram_url : ${withUrl}`);
    if (APPLY) {
      for (let i = 0; i < objects.length; i += 100) {
        const batch = objects.slice(i, i + 100);
        const { error } = await supabase.storage.from(BUCKET).remove(batch);
        if (error) console.error(`  ✗ delete batch: ${error.message}`);
      }
      // neq on a never-NULL column matches every row; Supabase requires a
      // filter on update, so this is the "all rows" idiom.
      const { error } = await supabase
        .from("questions")
        .update({ diagram_url: null, diagram_source: null })
        .neq("question_number", " ");
      if (error) console.error(`  ✗ clear columns: ${error.message}`);
      else console.log(`  ✓ storage emptied and diagram_url/diagram_source cleared`);
      rows.forEach((r) => { r.diagram_url = null; r.diagram_source = null; });
    }
  }

  // ── Phase B — upload screenshots ──────────────────────────────────────────
  console.log(`\n── Phase B: upload screenshots ──`);
  const figureUpdates = new Map(); // question id -> url
  let files = 0, orphans = [];

  for (const subject of SUBJECTS) {
    const base = `boardedge-data/${subject}/diagram-screenshots`;
    if (!existsSync(base)) continue;
    const subjectId = idByName[subject];
    if (!subjectId) { console.error(`  ✗ no subject row named "${subject}"`); continue; }

    for (const year of readdirSync(base)) {
      for (const file of readdirSync(`${base}/${year}`)) {
        if (!/\.png$/i.test(file)) continue;
        files++;
        const stem = segsFile(file);
        const hits = rows.filter(
          (r) => r.subject_id === subjectId && String(r.year) === year && covers(stem, segsQN(r.question_number))
        );
        if (!hits.length) { orphans.push(`${subject}/${year}/${file}`); continue; }

        const storagePath = `${subject}/${year}/${file}`;
        if (APPLY) {
          const { error } = await supabase.storage
            .from(BUCKET)
            .upload(storagePath, readFileSync(`${base}/${year}/${file}`), {
              contentType: "image/png",
              upsert: true,
            });
          if (error) { console.error(`  ✗ upload ${storagePath}: ${error.message}`); continue; }
        }
        const url = publicUrl(storagePath);
        for (const h of hits) figureUpdates.set(h.id, url);
      }
    }
  }
  console.log(`  screenshot files      : ${files}`);
  console.log(`  questions given a url : ${figureUpdates.size}`);
  if (orphans.length) {
    console.log(`  ⚠ orphan files (match no question):`);
    orphans.forEach((o) => console.log(`      ${o}`));
  }

  // ── Phase C — decide each row's final state ──────────────────────────────────
  console.log(`\n── Phase C: classify ──`);
  const plan = [];
  for (const r of rows) {
    const url = figureUpdates.get(r.id) ?? null;
    let source = null;
    let required = Boolean(r.diagram_required);

    if (r.question_type === "diagram") {
      // Student must draw. Blocked regardless of anything else.
      source = "ocr_pending";
      required = true;
    } else if (MAP_RE.test(r.question_text || "")) {
      source = "physical_map";
      required = true;
    } else if (url) {
      source = "figure";
      required = true;
    } else if (required && looksTextual(r.question_text)) {
      // Flagged by the text-pattern pass, but the "below" is inline text.
      required = false;
    }

    if (r.diagram_url !== url || r.diagram_source !== source || Boolean(r.diagram_required) !== required) {
      plan.push({ r, url, source, required });
    }
  }

  const tally = (key) => {
    const m = {};
    for (const p of plan) m[p[key] ?? "null"] = (m[p[key] ?? "null"] ?? 0) + 1;
    return m;
  };
  console.log(`  rows changing : ${plan.length}`);
  console.log(`  by new diagram_source : ${JSON.stringify(tally("source"))}`);

  const finals = { figure: 0, physical_map: 0, ocr_pending: 0, none: 0 };
  for (const r of rows) {
    const p = plan.find((x) => x.r.id === r.id);
    const src = p ? p.source : r.diagram_source;
    finals[src ?? "none"]++;
  }
  console.log(`  FINAL state of all ${rows.length} questions: ${JSON.stringify(finals)}`);

  if (!APPLY) {
    console.log(`\nNothing written. Re-run with --apply.\n`);
    return;
  }

  // ── Phase D — write ───────────────────────────────────────────────────────
  console.log(`\n── Phase D: write ──`);
  let ok = 0, failed = 0;
  for (const p of plan) {
    const { data, error } = await supabase
      .from("questions")
      .update({ diagram_url: p.url, diagram_source: p.source, diagram_required: p.required })
      .eq("id", p.r.id)
      .select("id");
    // A filter that matches nothing returns error:null with an empty set, so
    // the row count is the only reliable signal that the write landed.
    if (error) { console.error(`  ✗ ${p.r.question_number}: ${error.message}`); failed++; }
    else if (!data?.length) { console.error(`  ✗ ${p.r.question_number}: matched 0 rows`); failed++; }
    else ok++;
  }
  console.log(`  updated ${ok} rows${failed ? `, ${failed} FAILED` : ""}`);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
