# BoardEdge — UI Handoff 3

Supersedes `ui_handoff2.md`. Read `boardedge-design-system-v2.md` alongside this for full token/semantic reference.

## Scope
UI only. No backend logic, DB schema, or evaluation logic unless a UI requirement is blocked by a missing/wrong field — flag it, don't fix it here.

## What changed since Handoff 2
- **Full visual redesign approved** — replacing the champagne-gold/`#C5A880` system with dark-navy (`#0B0E14`) base + saturated gold (`#F5A623`) accent. See `boardedge-design-system-v2.md` for the complete token set. `globals.css` and every reference to `--accent`/`--premium`/`text-purple-400` needs rewriting, not patching.
- **`points_missed` color — RESOLVED.** Red (`#F0553D`). No longer pending founder confirmation. Remove from Open Decisions.
- **Premium gating and waitlist — CUT FROM SCOPE.** `PremiumGate.tsx`, its `variant` prop system (`conceptual`/`model`/`tips`), the frosted-glass overlay, and `WaitlistCapture` are being removed entirely, not re-skinned. This also resolves the old purple-conflict issue (Improvement Tips vs. premium-lock vs. Attempted status all sharing `#A855F7`) — with the lock gone, purple is single-purpose again (Improvement Tips tag + History "Attempted" tag only).
- **Sidebar interaction model changed.** Reference spec calls for icon-only rail that expands to full labels on click, staying expanded until clicked again — not the current always-expanded `Sidebar.tsx`. This is a new interaction, not a re-skin of the existing component.
- **Font strategy unchanged** — Geist Sans / `numericMono` from Handoff 2 carries forward as-is.

## Route Structure
Unchanged from Handoff 2 — no new routes required for this redesign pass.

## Reference Images — Required Before Claude Code Can Use Phase 3
Every "reference image N" citation below refers to screenshots seen only in the design chat, not in this file. On Claude Code desktop, drag all 10 image files directly into the chat input alongside your first prompt (or paste them in) — it reads images natively, same as this chat does, so you don't need to describe them. Keep the text table below only as a fallback if you'd rather not carry the files over, or want a written cross-reference while reviewing its output.

| Ref | What it shows |
|---|---|
| Image 1 (Account) | Settings-style key-value list: labeled rows (name, email, DOB, etc.) in a bordered table, no card glow, small profile photo top-left (photo is being dropped per your correction) |
| Image 2 (Dashboard) | Left sidebar + hero greeting card top-left, bar chart card below it, several donut/ring charts along the right column |
| Image 3 (Evaluation, sketch) | Left column: subject/topic/question-type/count selectors + Generate button. Right column: question field, answer field, Eval button, then a marks badge next to "Examiner Feedback," with conceptual-errors, points-hit, points-missed, improvement-tips, and model-answer as separate bordered blocks below |
| Image 4 (History structure reference) | Dark table with 4 stat/summary cards across the top, searchable/sortable list below — structure only, not colors |
| Image 5 (Landing) | Full-bleed radial glow behind a large centered headline, logo/proof strip below it, then a 2-row card grid of features, then numbered stat blocks, then project showcase cards |
| Image 6 (Login) | Split screen: image + wordmark + tagline on the left half, form (email, password, remember-me, submit, divider, OAuth buttons) on the right half |
| Image 7 (Signup) | Same split-panel pattern as Login; form side has first/last name, email, password, terms checkbox, submit, OAuth |
| Image 8 (Sidebar states) | Two states side by side: expanded (icon + label, profile card top, Support button, Settings/Logout below) and collapsed (icon-only rail, same structure) — confirms the click-to-expand model |
| Image 9 (FAQ) | Numbered accordion rows in a bordered card; one row expanded showing multi-paragraph answer text, `+`/`×` toggle icon on the right |
| Image 10 (Cards) | Rounded card with icon top-left, bold title, smaller muted subtext directly beneath it — no extra chrome |

---

## Implementation Roadmap (ordered — do not skip ahead)

### Phase 0 — Scope cut (do first, reduces surface area for everything after)
1. Remove `PremiumGate.tsx` and all call sites (`conceptual`/`model`/`tips` variants in eval page).
2. Remove `WaitlistCapture` component and its route/API tie-in if UI-only (flag if it touches backend beyond a simple removal).
3. Confirm no orphaned imports/dead CSS classes left behind (`bg-premium/10`, `text-purple-400` used only for the removed lock).

### Phase 1 — Token layer
4. Rewrite `globals.css` per `boardedge-design-system-v2.md` §2 — full replacement, not merge.
5. Update `lib/ui.ts` exports (`inputBase`, `btnPrimary`, `btnSecondary`, `cardInteractive`, `scoreBadgeClass()`, etc.) to reference new tokens.
6. Run the Gold Rule audit (§5 of design-system-v2) as a grep pass: `--accent`/`#F5A623` should only appear in CTA buttons, sidebar active state, ghost-button bg.

### Phase 2 — Shared components
7. Rebuild `Sidebar.tsx` for click-to-expand icon rail (new interaction, see above). Update `MobileNav.tsx` to match if the pattern extends to mobile — confirm with founder if unclear.
8. Restyle shared primitives (`btnPrimary`, `inputBase`, `errorAlert`) to new tokens.

### Phase 3 — Page-by-page
9. Login/Signup — apply split-panel layout per reference images 6–7; remove "Continue with Apple"; keep Google OAuth.
10. Landing — sticky thin nav, proof strip, 3-card feature row (card style per reference image 10), FAQ accordion (5 questions, single-expand per reference image 9), thin footer. **Do not write hero copy** — still an open blocker, ask or get sign-off on drafted options.
11. Dashboard — hero greeting card (glow per §6), accuracy chart + bar-by-chapter, subject donuts. Donut count/selection logic still unspecified — flag before building, don't guess.
12. Evaluation page — apply resolved semantic mapping (§3), no glow, per data-scanning rule.
13. History page — 4 stat cards + list, semantic mapping per §4, no glow.
14. Account — drop profile photo, plain contrast text, no glow.

### Phase 4 — Audit
15. Full pass against the Gold Rule checklist (§5).
16. Confirm glow appears only on Landing hero / Auth image-half / Dashboard hero card — nowhere else.
17. Re-verify `dark` className still hardcoded in root `layout.tsx` (carried over from Handoff 2, never confirmed closed).

## Open Decisions — Status After This Session
1. **Question dropdown — RESOLVED.** Strip preview text entirely; dropdown shows `Q{question_number}` only, full text lives in the Question Reference panel below.
2. **`diagram` question type — RESOLVED for now.** Block with a message in this phase. A dedicated UI branch to render the diagram alongside the question is planned for a later phase (see Diagram Rendering note below) — do not build it yet.
3. **Geography SQL query — status unclear, needs founder confirmation.** Marked "resolved" but no result set has been returned in this thread. Either the query was already run elsewhere (confirm where) or it still needs running against the live DB — clarify before Claude Code treats this as closed.
4. **`points_missed` — RESOLVED.** Red (`#F0553D`), see design-system-v2.
5. **Segmented control (Subject) / searchable combobox (Question) — still blocked, spec clarified below.** These aren't full custom builds — "interaction spec" means: for the segmented control, which subjects are visible without scrolling and what happens on overflow; for the combobox, whether it filters options as the user types and whether arrow-key navigation is required. Until those two behaviors are answered, Claude Code should leave the native `<select>` elements in place and re-skin them only with the new tokens — do not attempt the custom components yet.
6. **Loading-state copy — RESOLVED.** Two rotation sets, selected by evaluation path:
   - **Non-OCR eval:** "Analyzing text structure…" → "Hunting for those precious keywords…" → "Evaluating conceptual clarity and depth…" → "Finalizing your score…"
   - **OCR eval:** "Transcribing handwritten script…" → "Deciphering your doctor-level handwriting…" → "Generating examiner report and score breakdown…" → "Finalizing your score…"
   Claude Code needs to detect which path a given submission takes (typed answer vs. scanned/handwritten upload) and rotate the matching set.
7. **Dashboard command-center widget list — deferred, coming update.**
8. **Landing hero copy — deferred, coming update.**
9. **Mobile accordion expand behavior (eval page cards) — deferred, coming update.**

## Mobile Responsiveness — Now a Build Requirement, Not a Follow-Up Audit
Every phase in the roadmap above must ship mobile-responsive, not get a separate audit pass afterward. Concretely:
- Phase 2 (Sidebar): the click-to-expand rail must define its mobile behavior alongside desktop — don't reuse desktop's click-to-expand logic for `MobileNav.tsx` without confirming it fits a slide-over drawer.
- Phase 3 (every page): build and verify at both breakpoints before marking the page done, not after the whole phase is "complete."
- Item 9 above (eval-page accordion) is the one piece of mobile behavior still genuinely blocked on spec — everything else is standard responsive layout work, not a separate blocker.

## Diagram Rendering (flag for later phase, not this pass)
Showing the actual diagram image next to a `diagram`-type question needs: (a) a diagram asset field/URL on the `questions` row — a backend/DB change, out of this UI-only scope — and (b) a simple image-display component on the UI side, which is not heavy lift once the asset is available. The UI piece is not hectic. The blocker is the backend field not existing yet — flag it there when this phase comes up, don't build the DB layer here.

## Still Outstanding (carried from Handoff 2, unaffected by this redesign)
- `forgot-password/page.tsx` — never uploaded, unaudited

## Handoff Instruction for Claude Code
```
Continuing UI redesign on BoardEdge. Read ui_handoff3.md and
boardedge-design-system-v2.md fully first — the second file is the
token/semantic source of truth, this file is the execution order.

Before reporting any new bug, diff the actual live file against what
these docs claim is current.

Do not touch backend/DB/evaluation logic unless a UI requirement is
blocked by a missing/wrong API field — flag it, don't fix it here.
Do not fabricate product copy, feature specs, or brand language —
ask for it or flag it as a blocker.

Execute Phases 0-4 in order, in boardedge-design-system-v2.md and
this file's numbered sequence. Do not start a later phase's tasks
before the current phase is fully applied and verified against the
live repo. Flag anything blocked (see Still Outstanding) instead of
guessing at a spec.
```
