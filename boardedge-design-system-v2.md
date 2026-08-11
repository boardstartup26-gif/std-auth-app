# BoardEdge — Design System v2 (Handoff)

Reconciles the new dark-navy/gold spec (screenshots + color reference) against the **locked** tokens in `ui_handoff2.md`. Read that file first for route structure and outstanding bugs — this document supersedes its `Tokens` and `Semantic color mapping` sections only.

---

## 1. Flaw Resolution Log

| # | Original flaw | Resolution |
|---|---|---|
| 1 | Gold value changed (`#C5A880` → `#F5A623`) without acknowledgment | **Confirmed intentional.** Every color in the new system, including the gold shift, is deliberate. `#C5A880` is fully retired — purge on sight. |
| 2 | Purple (`#A855F7`) triple-booked across Improvement Tips, "Attempted," and premium-lock | **Resolved by scope cut.** `PremiumGate` and `WaitlistCapture` are being removed entirely from the Evaluation page (and wherever else they appear) — not re-skinned. With the premium-lock meaning gone, `#A855F7` is back to two uses (Improvement Tips tag, History "Attempted" tag), which is acceptable since those two never compete for attention on the same read — one is a feedback category, the other a status label at a glance. |
| 3 | `points_missed` color undecided | **Resolved.** `#F0553D`, red — confirmed current as of `ui_handoff3.md`. Treat as closed everywhere this doc or Handoff 2 previously flagged it pending. |

No open flaws remain in the token system itself. Remaining blockers are content/spec gaps (dashboard widget list, landing copy, etc.), tracked in `ui_handoff3.md`, not color/token issues.

---

## 2. `globals.css` — Full Token Replacement

```css
:root.dark {
  /* Base */
  --background: #0B0E14;
  --card: #181C24;
  --surface-raised: #1F2430;     /* modals, dropdowns, active sidebar bg */
  --foreground: #E8E9EC;
  --muted-foreground: #8B8F98;
  --border: #2A2F3D;

  /* Brand accent — interactive only, see Rule below */
  --accent: #F5A623;
  --accent-hover: #E8960F;
  --accent-subtle: #F5A6231A;    /* 10% wash — ghost buttons, active sidebar bg */

  /* Semantic — shared History + Eval logic */
  --status-correct: #3DDC84;
  --status-correct-subtle: #3DDC8415;
  --status-wrong: #F0553D;
  --status-wrong-subtle: #F0553D15;
  --status-partial: #F5D020;
  --status-partial-subtle: #F5D02015;

  /* Eval-page-only tags */
  --tag-conceptual: #E8642A;
  --tag-conceptual-subtle: #E8642A15;
  --tag-model-answer: #3B82F6;
  --tag-model-answer-subtle: #3B82F615;
  --tag-examiner-feedback: #6B7280;
  --tag-examiner-feedback-subtle: #6B728015;
  --tag-improvement-tips: #A855F7;
  --tag-improvement-tips-subtle: #A855F715;

  /* History-only */
  --status-attempted: #A855F7;   /* == improvement-tips, see Flaw #2 */

  /* Glow (Landing hero / Auth image-half / Dashboard hero only) */
  --glow-purple: #7C3AED;
}
```

Remove entirely: `--premium`, the old `--accent: #C5A880`, and every `text-purple-400` reference used as a stand-in for premium — replace with `--tag-improvement-tips` / `--glow-purple` depending on context, per Flaw #2's resolution.

---

## 3. Semantic Mapping — Eval Page (supersedes `ui_handoff2.md` table)

| Field | Border/Tag | Background | Notes |
|---|---|---|---|
| `points_hit` | `--status-correct` | `--status-correct-subtle` | was muted green — now fully saturated, resolved |
| `points_missed` | `--status-wrong` | `--status-wrong-subtle` | **resolved**, was pending — see Flaw #3 |
| `conceptual_errors` | `--tag-conceptual` | `--tag-conceptual-subtle` | burnt orange, distinct from partial-yellow |
| `model_answer` | `--tag-model-answer` | `--tag-model-answer-subtle` | deep blue, distinct container + `CISCE verified`/`AI generated` badge unchanged |
| `examiner_feedback` | `--tag-examiner-feedback` | `--tag-examiner-feedback-subtle` | neutral grey |
| `improvement_tips` | `--tag-improvement-tips` | `--tag-improvement-tips-subtle` | purple — no longer gated behind `PremiumGate`, renders directly |
| Marks declared | Full marks → `--status-correct` · Partial → `--status-partial` · Zero → `--status-wrong` | — | new — not in old system |
| Question/Answer fields, Eval/Submit buttons | `--accent` | — | brand gold, per Rule in §5 |
| Other input fields | `--border` | — | plain neutral, not gold |

Background/surface: flat `--background` / `--card` — **no glow** on this screen (data-scanning rule, unchanged from your original spec).

---

## 4. Semantic Mapping — History Page

| Card | Color |
|---|---|
| Attempted | `--status-attempted` (purple) |
| Correct | `--status-correct` |
| Wrong | `--status-wrong` |
| Partially Correct | `--status-partial` |

Also flat, no glow.

---

## 5. The Gold Rule (enforce in code review)

`#F5A623` / `--accent` appears **only** on: primary CTA buttons, sidebar active indicator + active nav icon, ghost-button backgrounds (`--accent-subtle`). It does not appear on borders, decorative icons, or any semantic tag. Audit checklist before merge:

- [ ] Sidebar: active item bg `--accent-subtle`, active icon/text `--accent`, inactive icons default `--muted-foreground`
- [ ] Login/Signup: submit button `--accent`, all other borders `--border`
- [ ] Eval page: Question/Answer field focus ring + Eval/Submit buttons only
- [ ] No gold anywhere in Eval tag set, History tag set, or Account page

---

## 6. Glow Placement (unchanged from your spec, now with hex)

| Surface | Glow |
|---|---|
| Landing hero | `--glow-purple` @ 35%, radial, top-center, fades to `--background` by mid-page |
| Login/Signup | `--glow-purple` @ 25%, radial, image-half only |
| Dashboard hero card | `#1E3A5F` → `--card` gradient, welcome banner only |
| Eval / History / Account | **none** — flat surfaces, per your data-scanning rule |

---

## 7. Per-Screen Notes from Reference Images

- **Account** (img 1): drop the profile photo per your correction; keep the labeled key-value row layout, plain contrast text, no card glow.
- **Dashboard** (img 2): hero greeting card (glow), accuracy chart + bar-by-chapter left, 3–4 subject donuts right. Donut count and which subjects are "attempted-only" filter — not yet specified, still a blocker on `Dashboard command-center redesign` in `ui_handoff2.md`.
- **Evaluation** (img 3, sketch): confirms your written spec — glowing bordered cards, big high-contrast marks/tags, low visual noise.
- **History** (img 4 reference, dark fintech table): 4 stat cards up top, list/table below — good density reference, but note its accent usage (purple "New," green up-arrows) is a **structure** reference only, not a color reference; your History colors are fixed in §4.
- **Landing** (img 5): thin sticky nav, proof strip, 3-card row confirmed. Copy in the reference ("Innovating Tomorrow...") is placeholder branding language — do not reuse; landing hero copy is still an open blocker in `ui_handoff2.md`.
- **Login/Signup** (imgs 6–7): structurally near-identical to your target — split panel, image left, form right. Drop "Continue with Apple" per your note; Google OAuth stays.
- **Sidebar** (img 8): click-to-expand icon rail confirmed as the interaction model — this is new information not in `ui_handoff2.md`'s `Sidebar.tsx ✅`, meaning current sidebar (always-expanded, per that file) needs an interaction-model change, not just a re-skin. Flag as scope addition, not a bug fix.
- **FAQ** (img 9): accordion, single-expand, numbered rows — matches your 5-question spec.
- **Cards** (img 10): title + smaller subtext inside card — apply to landing 3-card feature row.

---

## 8. Remaining Blockers (unchanged, still need founder input)

Everything under `Open Decisions Needed From Founder` in `ui_handoff2.md` **except** item 4 (`points_missed` — resolved above). Items 1, 2, 5–9 still stand and now additionally need: dashboard donut subject count/selection logic, landing hero copy, and confirmation on the sidebar click-to-expand interaction (new, from img 8).
