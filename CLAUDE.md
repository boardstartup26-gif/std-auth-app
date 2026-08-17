# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project overview

BoardEdge (package name `std-auth`) is an AI-powered answer evaluation platform for ICSE/CISCE (Class 9/10) students. A student picks a past-paper question, submits their written answer, and the app grades it against a stored marking scheme — either via exact-match logic (objective/MCQ questions) or a Claude-graded rubric (subjective/short-answer questions) — returning marks, points hit/missed, conceptual errors, a model answer, examiner feedback, and improvement tips. Core flows: sign up/log in (email+password or Google OAuth) → dashboard → pick a question in `/evaluate` → submit answer → view graded result → browse past submissions in `/history`.

## Tech stack

- **Next.js 16.2.9** (App Router, React 19.2.4) — this major version postdates most training data; per `AGENTS.md`, consult `node_modules/next/dist/docs/` before assuming an API works as remembered.
- **Supabase**: `@supabase/ssr@0.10.2` + `@supabase/supabase-js@2.104.0` for Postgres, auth, and RLS. A baseline schema dump lives in [supabase/migrations/](supabase/migrations/) (pulled via `supabase db pull`) — see "Known gotchas" for how to keep it in sync.
- **Anthropic SDK** `@anthropic-ai/sdk@0.71.0`, model `claude-sonnet-4-5`, used only for subjective-answer grading in [src/app/api/evaluate/route.ts](src/app/api/evaluate/route.ts).
- **Tailwind CSS v4** (via `@tailwindcss/postcss`), **Zod v4** for runtime validation, **TypeScript 5** in strict mode.
- **Auth**: Supabase Auth, not a raw Google ID-token flow. Email/password uses `signInWithPassword`/`signUp` server actions in [src/app/(auth)/actions.ts](src/app/(auth)/actions.ts). Google uses `supabase.auth.signInWithOAuth({ provider: "google" })` client-side (in [AuthForm.tsx](src/app/(auth)/_components/AuthForm.tsx)), redirecting through [src/app/auth/callback/route.ts](src/app/auth/callback/route.ts), which calls `exchangeCodeForSession(code)` (PKCE code exchange, not an ID token posted directly). Session refresh/route protection happens in [middleware.ts](middleware.ts), which owns the list of protected path prefixes.

## Commands

- `npm run dev` — start the dev server (Next.js, default port 3000).
- `npm run build` — production build.
- `npm start` — run a production build.
- `npm run lint` — ESLint (`eslint-config-next` core-web-vitals + typescript configs, flat config in [eslint.config.mjs](eslint.config.mjs)).
- `npm run parse:chemistry-pdfs` — one-off data-import script (see `scripts/`); several other one-off `scripts/*.mjs` importers exist for other subjects but have no npm aliases — run with `node scripts/<name>.mjs`.
- **No test script/framework is configured** — there are no test files in the repo. Don't assume Jest/Vitest is available.
- **Deployment**: no `vercel.json` or CI workflow in the repo — deployment is inferred to be Vercel's default git-integration (push to the connected branch), not a scripted step here. Confirm with the user before assuming deploy behavior.

## Architecture

- [src/app/api/evaluate/route.ts](src/app/api/evaluate/route.ts) — the core evaluation engine. Looks up the question + marking scheme by `(subject, year, paper, question_number)`, reserves tokens atomically via the `increment_usage` Postgres RPC *before* calling Claude, branches to either deterministic objective-answer matching (`matchObjectiveAnswer`) or a Claude call with a strict system prompt + Zod-validated JSON output + a hard `marks_awarded` clamp, then persists to `student_answers`/`evaluations` via `persistSubmission`. Read this file in full before touching grading, token cost, or persistence logic — the inline comments document several past races/bugs and why the current approach avoids them.
- [src/lib/supabase/server.ts](src/lib/supabase/server.ts) / [client.ts](src/lib/supabase/client.ts) — two server-side clients: `createClient()` (session-bound, respects RLS, used for auth checks) and `createAdminClient()` (service-role key, **bypasses RLS**, used for all business-data reads/writes in API routes). Getting these mixed up is a real risk: using the admin client where the user client belongs defeats RLS.
- [middleware.ts](middleware.ts) — single source of truth for which routes require auth (`PROTECTED_PREFIXES`). Adding a new authenticated page requires adding its prefix here, not just relying on in-page checks.
- `src/app/(protected)/*` — dashboard, evaluate, history, account pages (route group, requires auth per middleware). `src/app/(auth)/*` — login/signup/forgot-password. `src/app/api/*` — evaluate, usage (daily token count), feedback.
- [src/lib/ui.ts](src/lib/ui.ts) — shared Tailwind class-string constants (buttons, cards, inputs, score-badge coloring) and [boardedge-design-system-v2.md](boardedge-design-system-v2.md) — the authoritative color-token spec (dark-navy/gold theme, semantic colors for points-hit/missed/conceptual-errors/etc). Check this doc before hand-picking colors for eval/history UI.

## Code style & conventions

- Path alias `@/*` → `src/*` (see [tsconfig.json](tsconfig.json)).
- Server Components/Actions by default; `"use client"` only where interactivity is needed (forms, OAuth button).
- Mutations go through `"use server"` actions (`useActionState` + `useFormStatus`) rather than client-side fetch where possible — see [src/app/(auth)/actions.ts](src/app/(auth)/actions.ts).
- API routes return `NextResponse.json({ error, detail? }, { status })` on failure with a specific HTTP status (400/401/404/429/500/502) — match this shape for new routes rather than inventing a new error envelope.
- Reusable Tailwind strings live in [src/lib/ui.ts](src/lib/ui.ts) as exported `const` strings (`btnPrimary`, `cardPadded`, etc.) — prefer reusing/extending these over inlining new class combos for common elements.
- Section-comment banners (`// ─── Name ───`) are used to divide long route files into logical blocks (see `evaluate/route.ts`) — follow this pattern in similarly long files rather than splitting into many small modules.
- Errors from Supabase/Claude are logged with a `[BoardEdge]` prefix via `console.error`/`console.warn` before returning a generic message to the client — don't leak raw provider errors to the response body.

## Domain-specific rules

- **Token economy**: `DAILY_TOKEN_LIMIT = 10` tokens/day, reset by IST calendar date (`getUsageDateIST()`, `Asia/Kolkata`). Subjective (Claude-graded) questions cost `TOKEN_COST_SUBJECTIVE = 3`; objective/MCQ questions cost `TOKEN_COST_OBJECTIVE = 1`. These three constants are defined once in [src/app/api/evaluate/route.ts](src/app/api/evaluate/route.ts) but the `10` limit is **also hardcoded separately** in [src/app/api/usage/route.ts](src/app/api/usage/route.ts) — if you change the limit, update both places.
- Token spend is reserved via the `increment_usage` RPC *before* the Claude call (reserve-then-spend, not check-then-spend) to close a race between concurrent requests. If the Claude call subsequently fails or its output fails Zod validation, `refundTokens()` is called to give the token back — preserve this reserve/refund pairing in any change to the eval flow.
- No premium/paid tier currently gates content — per [boardedge-design-system-v2.md](boardedge-design-system-v2.md) §1, `PremiumGate` and the purple premium-lock UI were **intentionally removed**; `improvement_tips` now render unconditionally. Don't reintroduce gating without being asked — the commit history (`b6075fb`) confirms this was a deliberate removal, not an oversight.
- Grading is scheme-bound by design: the Claude system prompt in `buildSystemPrompt()` explicitly forbids grading from outside knowledge, requires citing only the provided `scheme_text`/`key_points`, and treats the student's answer text as untrusted data (prompt-injection guard against answers that try to instruct the grader). Preserve this boundary if you touch the prompt.
- `marks_awarded` from Claude is schema-validated by Zod *and* separately clamped to `[0, total_marks]` in code — the schema only checks shape (it's a `number`), not range, so both checks are load-bearing; don't remove the clamp on the assumption Zod already covers it.

## Things NOT to touch or change without asking

- Token cost/limit constants and the reserve→evaluate→refund sequencing in `evaluate/route.ts` — this is atomicity/race-condition-sensitive logic with documented past bugs (see inline `// FIX:` comments).
- The `increment_usage` Postgres RPC and any Supabase RLS policies — changes should go through `supabase migration new <name>` + `supabase db push` (see [supabase/migrations/](supabase/migrations/)) rather than the dashboard, but ask before applying schema changes since they affect auth/token enforcement in production.
- `createAdminClient()` usage — it bypasses RLS. Don't swap a `createClient()` (user-scoped) call for the admin client to "make something work" without confirming the RLS bypass is intended.
- The Claude system/user prompt construction in `buildSystemPrompt()`/`buildUserMessage()` — rubric wording changes affect real student grades.
- [boardedge-design-system-v2.md](boardedge-design-system-v2.md) semantic color mappings — treat as a locked spec, not a suggestion.

## Known gotchas

- **Duplicate route trees**: `src/app/protected/layout.tsx` (no parentheses) is a stray leftover next to the real `src/app/(protected)/*` route group — it is not part of the active route structure (route groups in parens don't affect the URL). Don't edit it thinking it's live.
- **Dead file, intentionally excluded**: `src/app/(protected)/evaluate/page_scc.tsx` is excluded in `tsconfig.json`'s `exclude` list — it's a backup/scratch copy of the evaluate page, not in use. Don't "fix" type errors in it; it's meant to stay out of the build.
- **Schema migrations**: [supabase/migrations/](supabase/migrations/) holds a baseline schema dump pulled from the linked Supabase project (`xjbyjaxuwcfzfssykkds`) via `supabase db pull`. Schema changes should now go through `supabase migration new <name>` (edit the generated SQL, then `supabase db push`) rather than editing the Supabase dashboard directly, so the migration history stays in sync with this repo.
- Supabase env var lookups fall back through multiple names (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` → `NEXT_PUBLIC_SUPABASE_ANON_KEY` → ...) in three separate places ([middleware.ts](middleware.ts), [server.ts](src/lib/supabase/server.ts), [client.ts](src/lib/supabase/client.ts)) — `.env.example` only documents the first pair; check `.env.local`'s actual keys (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` are also required, not in `.env.example`).
- `boardedge-data/` holds raw/extracted past-paper source material (by subject) used by the one-off `scripts/*` importers — it's data, not app code; large PDF/JSON content here isn't meant to be read wholesale into context.
