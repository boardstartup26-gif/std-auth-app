# BoardEdge — UI Redesign Handoff
**Target build environment:** Claude Code
**Status:** Design system locked. Build order: design system + app shell → landing page.

---

## 0. Locked Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Visual direction | Light-first editorial — paper, ink, exam-adjacent |
| 2 | Landing architecture | Continuous scroll narrative, sticky/pinned product demo |
| 3 | UX priorities | Scroll-triggered reveals, micro-interactions on evaluation feedback, progressive disclosure in-app, shared design language landing↔app |
| 4 | Animation library | **GSAP + ScrollTrigger** |
| 5 | Display typeface | **Fraunces** (variable — `opsz`, `wght`, `SOFT`, `WONK` axes) |
| 6 | Build order | Design system + app shell first, landing page second |
| 7 | Accent colour | Gold (`#F5A623`) **retired from light mode** — fails contrast on paper (~2.0:1 vs required 4.5:1). Replaced with teacher's-red accent system below. Gold survives only as the `withheld` (partial credit) token. |

Core concept: **the product already has a native visual language — the marked exam script.** Paper, ruled margins, a red pen, running mark totals in the margin. The redesign makes this explicit instead of defaulting to generic SaaS dark-mode-plus-gradient treatment.

---

## 1. Colour System

Light is canonical. Dark is a true token inversion — not a separate design.

| Token | Light | Dark | Role |
|---|---|---|---|
| `bg` | `#FAF9F5` | `#0E0F12` | Page — warm paper, never pure white |
| `surface` | `#FFFFFF` | `#17191E` | Cards sit brighter than the page |
| `ink` | `#16181D` | `#F4F2EC` | Primary text |
| `ink-muted` | `#5C6068` | `#9AA0A8` | Secondary text, metadata, "missed" state |
| `rule` | `#E4E0D6` | `#262A31` | Hairlines, margin rules — the only source of depth |
| `accent` | `#C43D2B` | `#FF6B52` | Interactive elements, marks, ticks |
| `awarded` | `#1F6B4A` | `#4FBF8B` | Full marks earned |
| `withheld` | `#B08A00` | `#E3B341` | Partial credit (gold, redeemed as a semantic state, not decoration) |

**Hard rule:** no gradients, no glow, no glassmorphism, no coloured shadows. Depth comes from hairlines and paper elevation (`surface` vs `bg`) only.

```css
/* globals.css — Tailwind v4 @theme block */
@theme {
  --color-bg: #FAF9F5;
  --color-surface: #FFFFFF;
  --color-ink: #16181D;
  --color-ink-muted: #5C6068;
  --color-rule: #E4E0D6;
  --color-accent: #C43D2B;
  --color-awarded: #1F6B4A;
  --color-withheld: #B08A00;

  --font-display: "Fraunces", Georgia, serif;
  --font-sans: "Geist", "Inter", system-ui, sans-serif;
  --font-mono: "Geist Mono", "JetBrains Mono", monospace;

  --ease-editorial: cubic-bezier(0.16, 1, 0.3, 1);
  --dur-fast: 180ms;
  --dur-base: 320ms;
  --dur-slow: 560ms;
}

@media (prefers-color-scheme: dark) {
  @theme {
    --color-bg: #0E0F12;
    --color-surface: #17191E;
    --color-ink: #F4F2EC;
    --color-ink-muted: #9AA0A8;
    --color-rule: #262A31;
    --color-accent: #FF6B52;
    --color-awarded: #4FBF8B;
    --color-withheld: #E3B341;
  }
}
```

**Fraunces variable-font setup:**
```css
@font-face {
  font-family: "Fraunces";
  src: url("/fonts/Fraunces-Variable.woff2") format("woff2-variations");
  font-weight: 300 900;
  font-style: normal;
}

.display {
  font-family: var(--font-display);
  font-variation-settings: "opsz" 144, "SOFT" 0, "WONK" 1;
  font-weight: 480;
}
```
Use `"WONK" 1` on the largest display statements only (Act 0 masthead) — it introduces the ink-irregular character marks. Set `"WONK" 0` everywhere else; it reads as a typo at body sizes.

---

## 2. Typography Scale

| Role | Face | Size | Notes |
|---|---|---|---|
| Statement | Fraunces | `clamp(3.5rem, 9vw, 8rem)` | Landing only. Tracking `-0.03em`, leading `0.92` |
| Section head | Fraunces | `clamp(2rem, 4vw, 3.25rem)` | |
| Body | Geist / Inter | `17px` | Measure capped at 68ch |
| Metadata | Geist | `12px`, `0.08em` tracking, uppercase | Margin rail only |
| Marks & scores | Geist Mono | `tabular-nums` | Non-negotiable — mono reads as "graded," proportional reads as decorative |

**Constraint:** maximum three type sizes visible per screen. A fourth means the hierarchy is wrong.

---

## 3. Grid — The Margin Column

The device that unifies landing and app. Asymmetric grid on every page:

- Left margin rail: `~180px` desktop — metadata, section numbers, annotations
- Content column: 7-column measure — the actual narrative or product content
- Same hairline (`--color-rule`) separates rail from content everywhere

| Surface | Rail holds | Content column holds |
|---|---|---|
| Landing | Act number, section label, scroll progress | The narrative |
| Dashboard | Date, streak, token count | Papers, recent evaluations |
| Results | Running mark total, question index | Answer + marking scheme |
| History | Timeline dates | Attempt cards |

---

## 4. Motion — GSAP ScrollTrigger

| Property | Value |
|---|---|
| Entrance | `opacity 0→1`, `y: 16px → 0` |
| Duration | `320ms` base, `560ms` for display type |
| Easing | `cubic-bezier(0.16, 1, 0.3, 1)` (`--ease-editorial`) |
| Stagger | `60ms` between siblings |
| Scroll-scrub | `scrollTrigger: { scrub: true }`, bound to `transform`/`opacity` only |
| Tick draw | SVG `stroke-dashoffset`, `400ms` — reads as a pen stroke, not a UI checkmark |

**Responsive/perf constraints (device profile: mid-range Android, primary user base):**
- Pinned/scrubbed `ScrollTrigger` sections: **desktop/tablet only**, gate with `ScrollTrigger.matchMedia({ "(min-width: 768px)": ... })`
- Below 768px: Act 2 degrades to a stepped, tap-advanced sequence — no pin, no scrub
- Animate `transform` and `opacity` exclusively; never `top`/`left`/`width`
- Full `prefers-reduced-motion` fallback: all GSAP timelines skip to end state, no scrub

```js
gsap.registerPlugin(ScrollTrigger);

const mm = gsap.matchMedia();

mm.add("(min-width: 768px)", () => {
  ScrollTrigger.create({
    trigger: "#act-2",
    pin: true,
    scrub: true,
    start: "top top",
    end: "+=2000",
  });
});

mm.add("(prefers-reduced-motion: reduce)", () => {
  gsap.set("[data-reveal]", { opacity: 1, y: 0 });
});
```

---

## 5. Landing Page — Six-Act Structure

| Act | Content | Mechanic |
|---|---|---|
| 0. Masthead | One oversized Fraunces statement, hairline rules, issue-line metadata. No hero image, no dashboard screenshot, no gradient orb | Static, 60ms stagger on load |
| 1. The Problem | Left column pins; right column scrolls a real ICSE answer being written | Sticky left / scroll right |
| **2. The Evaluation** ★ | Money moment — see data contract below | Scroll-scrubbed pin |
| 3. Provenance | Official CISCE scheme, subject coverage, sample size | Standard reveal |
| 4. Trajectory | Score Climber, progress over attempts | Chart draws on entry |
| 5. Close | One line, one button | Static |

---

## 6. Act 2 — Data Contract (build this asset first, by hand)

Static, pre-computed JSON — **no live inference inside the scroll animation.** Runtime latency variance would desync the tick-draw from scroll position.

**Schema alignment:** this file now mirrors the shipped `EvaluationOutput`/`MarkingPoint` shape exactly, field-for-field — `points_hit`/`points_missed` are retired everywhere, replaced by `marking_points[]`. The only thing Act 2 adds beyond a real record is nothing: `anchor` is part of the production shape too now (computed server-side via `resolveMarkingPointAnchors`), so this static file and a live Supabase row render through the identical component with zero translation layer.

**Subject: History & Civics**, using the real 2024 Q4(i) question (Council of Ministers vs. Cabinet) — the actual extracted question, the founder's own real submitted answer, and the real Claude-evaluated output. Not authored/synthesized.

**Status coverage — accepted 2-state.** History & Civics is binary-marked (CISCE: one valid point = one whole mark, no discretionary half-marks). This question's three 1-mark points cannot produce a `partial`. Confirmed accepted as-is — `withheld` gold does not appear in this demo. If a 3-state proof is wanted later, it requires a Physics/Chemistry numerical with a scheme-pre-split mark (value + unit), sourced separately.

**Question count in this file: one.** A single subjective evaluation object, not an array.

```json
{
  "subject": "History & Civics",
  "board": "ICSE",
  "year": 2024,
  "question_number": "4(i)",
  "question_text": "Mention any three points to distinguish between the Council of Ministers and the Cabinet.",
  "student_answer_text": "The Council of Ministers is a larger body consisting of all categories of ministers, including Cabinet Ministers, Ministers of State and Deputy Ministers, whereas the Cabinet is a smaller group of senior ministers holding important portfolios. The Cabinet meets frequently to decide important government policies, while the entire Council of Ministers rarely meets as one body. The Cabinet advises the President directly, whereas the Council of Ministers does not advise the President.",
  "total_marks": 3,
  "marks_awarded": 2,
  "is_objective": false,
  "marking_points": [
    { "point": "...", "marks": 1, "status": "awarded", "marks_awarded": 1, "matched_text": "The Council of Ministers is a larger body...important portfolios.", "anchor": { "start": 0, "end": 243 } },
    { "point": "...", "marks": 1, "status": "awarded", "marks_awarded": 1, "matched_text": "The Cabinet meets frequently...as one body.", "anchor": { "start": 244, "end": 377 } },
    { "point": "...", "marks": 1, "status": "missed", "marks_awarded": 0, "matched_text": null, "anchor": null }
  ],
  "conceptual_errors": ["..."],
  "model_answer": "...",
  "model_answer_source": "ai_generated",
  "examiner_feedback": "...",
  "improvement_tips": ["...", "...", "..."]
}
```

Field rules:
- `matched_text` is the ground truth; `anchor` is derived from it by exact string search (`student_answer_text.indexOf(matched_text)`) — same function the real API uses (`resolveMarkingPointAnchors` in `route.ts`). Never author `anchor` by hand-counting characters — that produced two separate mid-word truncation bugs earlier in this project, both caught only by the validator.
- `status` maps directly to colour tokens: `awarded → --color-awarded`, `partial → --color-withheld`, `missed → --color-ink-muted`.
- Point order in the array is the reveal order — no separate `order` field, matching the shipped schema (array position only).
- `token_cost`/`tokens_remaining` intentionally excluded — per-request billing metadata has no place on a public marketing page. (`results-page-sample.json`, the in-app fixture, keeps them.)
- Run `validate-showcase.py` against this file before every commit — it checks anchor/matched_text consistency, mark totals, and status coverage.

---

## 7. Build Order (for Claude Code session)

1. `globals.css` — colour tokens, Fraunces font-face, motion tokens
2. Layout primitives — margin-rail grid component, hairline component
3. App shell — dashboard, results page (progressive disclosure), history — using the shared grid
4. Landing page Acts 0, 1, 3, 4, 5 (static/standard reveal — lower risk)
5. Act 2 — author the JSON asset first, then build the ScrollTrigger pin against it
6. `prefers-reduced-motion` + `matchMedia` pass across all GSAP instances

---

## 8. Progressive Disclosure — Results Page

Three depths, collapsed by default:

1. Verdict — total mark, one-line assessment, mono score
2. Per question — marks awarded/withheld, expandable
3. Per marking point — exact CISCE scheme clause, matched or missed

Depth 3 is the product's actual value; it should require deliberate expansion, not load by default.

---

## 9. Full Evaluation Data Model (Supabase — real product data, shipped shape)

**Source of truth — production `EvaluationOutput`/`MarkingPoint` interfaces, as shipped in `route.ts`:**

```typescript
interface MarkingPoint {
  point: string;
  marks: number;
  status: "awarded" | "partial" | "missed";
  marks_awarded: number;
  matched_text: string | null;   // verbatim quote Claude copies from the student's answer
  anchor: { start: number; end: number } | null;  // computed server-side, never model-supplied
}

interface EvaluationOutput {
  marks_awarded: number;
  total_marks: number;
  marking_points: MarkingPoint[];   // replaces points_hit / points_missed entirely
  conceptual_errors: string[];
  model_answer: string;
  model_answer_source: "verified" | "ai_generated";
  examiner_feedback: string;
  improvement_tips: string[];
  is_objective?: boolean;
  correct_answer?: string;
  is_correct?: boolean;
  token_cost: number;
  tokens_remaining: number;
}
```

**`points_hit`/`points_missed` are retired, not just hidden.** They're superseded by `marking_points[]`, filtered by `status`: `marking_points.filter(p => p.status !== "missed")` and `.filter(p => p.status === "missed")`. The database column still exists on old rows (migration kept it rather than dropping it), but nothing writes to it going forward — don't build against it.

**Anchor integrity is structural, not authored.** `anchor` is never trusted from Claude directly — it's computed in `route.ts` via `resolveMarkingPointAnchors()`, which searches for `matched_text` verbatim inside the student's answer (`indexOf`, not character counting). If Claude paraphrases instead of quoting exactly, the search fails and `anchor` falls back to `null` — the point still renders, just without a highlighted span. This degrade-gracefully behaviour is why the Results page component must always treat `anchor: null` as valid on an `awarded`/`partial` point, not just on a `missed` one.

**No-half-mark policy (confirmed for ICSE History & Civics; Physics/Chemistry numericals legitimately use half-marks where the scheme itself pre-splits a value+unit point):** `marking_points[].marks_awarded` must be a whole number unless the subject's own scheme allows a fractional split. This is enforced in the prompt (`examiner-prompt.ts`), not in the Zod schema — the schema accepts any positive number, since the valid range is subject-dependent.

**`is_objective` is optional, not `false`-by-default.** Older records or subjective evaluations may have it `undefined`. Branch on `evaluation.is_objective === true`, never on plain truthiness.

`token_cost`/`tokens_remaining` are per-request account metadata — render them only on the student's own dashboard/account views, never on shared or public-facing evaluation displays.

`icse_style_issues`/`unassessable_components` are computed by Claude and used internally by the prompt's own reasoning (routing diagram-dependent content, style feedback) but were never persisted to the `evaluations` table even before this redesign — nothing to change here, no UI needed for them.

---

## 10. Storage

| Asset | Location | Rationale |
|---|---|---|
| Act 2 demo JSON | Static file in repo — `/lib/data/act2-showcase.json`, imported at build time | Fixed marketing asset, version-controlled, no DB round-trip for a landing page |
| Real evaluation records | Supabase `evaluations` table (existing path via `evaluate/route.ts`) | Live product data — no change from current architecture, display-layer redesign only |

---

## 11. Results Page — Layout & Motion (real evaluations)

Same margin-rail grid, colour tokens, and tick-draw motion as Act 2. **Different interaction model** — no scroll-jacking on a page a student revisits repeatedly. Progressive disclosure only.

| Depth | Rail | Content column | Schema fields |
|---|---|---|---|
| 1 — Verdict (default) | Subject, question number | `marks_awarded / total_marks` in mono, `examiner_feedback` as one line | `marks_awarded`, `total_marks`, `examiner_feedback` |
| 2 — Points (one tap) | — | One list — tick (`awarded`), dash (`withheld`), muted strike (`missed`), per `marking_points[].status`. Where `anchor` is not null, tapping a point highlights that exact span inside a rendering of `student_answer_text` shown alongside — same highlight mechanic as Act 2's tick-draw, on tap instead of on scroll | `marking_points[]` |
| 3 — Flagged errors | — | A separate callout, styled in `accent` — visually distinct from a plain miss, since a conceptual error is a wrong statement, not an omission | `conceptual_errors[]` |
| 4 — Footer (once Depth 1 open) | — | `model_answer` in a quoted margin-note treatment (Fraunces, smaller, `ink-muted`), with a small `model_answer_source` tag ("Verified" / "AI generated"); `improvement_tips[]` as a short list | `model_answer`, `model_answer_source`, `improvement_tips[]` |

**Anchor rendering must be defensive.** `marking_points[].anchor` is `null` whenever Claude paraphrased instead of quoting verbatim (see §9) — this is expected, not an error state. Render the point normally without a highlight when `anchor` is `null`; never treat a missing anchor as a reason to hide the point or fall back to a loading state.

`token_cost`/`tokens_remaining` are present on every real evaluation record — render them only on the student's own account/dashboard context, never on a shared or embedded evaluation view.

**Objective questions** (`is_objective: true`) skip Depths 2–3's list rendering — their single `marking_points` entry (see route.ts's objective path) still carries `matched_text`/`anchor`, but the component can render `is_correct`/`correct_answer` directly at Depth 1 instead, since there's only one point to show.

**Architecture note on subject count:** this component is subject-agnostic by construction — Physics, Chemistry, Biology, Geography, and History & Civics all render through it identically. Subject only ever touches the rail label. A new subject requires no new display logic.

---

## 12. Evaluate Page — Question Selection Flow

A five-step funnel, values only — build this using the design system (§1–5), not any existing reference layout.

| Step | Input | Behaviour |
|---|---|---|
| 1. Subject | Select/pill choice | Physics, Chemistry, Biology, Geography, History & Civics |
| 2. Chapter/Topic | Dependent select | Populated from Step 1's choice |
| 3. Answer Format | Select | e.g. Long answer, Short answer, Objective |
| 4. Browse Questions | Filterable list | **Year filter** + **free-text search box** over question text, scoped by Steps 1–3 |
| 5. Select Question | List item tap | Loads the question into the answer-entry view (question card, marks, answer text area, Evaluate action) |

Steps 1–3 narrow the pool; Step 4 is the search/filter surface; Step 5 commits the choice. Use the same margin-rail grid as every other page — chosen filters (subject, chapter, format, year) belong in the rail as running context, the question list and selected question live in the content column.
