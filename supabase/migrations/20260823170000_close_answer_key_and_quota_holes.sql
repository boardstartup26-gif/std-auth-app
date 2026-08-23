-- Two holes found by probing the live API as a real authenticated user.
--
-- ── 1. questions.correct_answer was readable by any logged-in student ───────
--
-- The previous migration closed marking_schemes (model_answer, scheme_text),
-- but the objective answer key lives in a second place: questions.correct_answer,
-- which /api/evaluate compares against for MCQ / true-false / fill-in-blank /
-- match. A student could read it before answering:
--
--     supabase.from("questions").select("question_number, correct_answer")
--
-- Verified returning real answers. RLS can't help here — it filters rows, and
-- the student is entitled to the row, just not that one column. Column-level
-- privileges are the right tool, so table-wide SELECT is replaced with a
-- per-column grant that omits correct_answer.
--
-- Grading is unaffected: /api/evaluate reads through the service-role client.
--
-- NOTE for future schema changes: a column added to questions after this
-- migration will NOT be readable by clients until it is added to the grant
-- below. That is the deliberate trade — fail closed, not open.

revoke select on public.questions from authenticated, anon;

grant select (
  id,
  subject_id,
  year,
  paper,
  question_number,
  question_text,
  created_at,
  topic_id,
  is_subjective,
  question_type,
  options,
  topic,
  diagram_url,
  diagram_required,
  diagram_source
) on public.questions to authenticated;

-- ── 2. A legacy SECURITY DEFINER RPC let anyone burn any user's quota ───────
--
-- increment_usage(user_id_param uuid, daily_limit_param integer) is superseded
-- by the 4-arg (p_user_id, p_date, p_cost, p_limit) version the app actually
-- calls. The old one is dead code AND dangerous:
--
--   * SECURITY DEFINER, so it runs as postgres and bypasses RLS on usage —
--     direct UPDATE/DELETE on that table is correctly blocked, but this
--     function wrote straight through. Confirmed incrementing a test user's
--     token_count from 9 to 10.
--   * EXECUTE granted to anon as well as authenticated, so the call does not
--     even need a session.
--   * user_id_param is caller-supplied and unchecked against auth.uid(), so
--     the target is any user whose UUID the caller knows.
--   * daily_limit_param is caller-supplied, so the cap is whatever the caller
--     says it is.
--
-- Only a foreign-key constraint stopped the anonymous probe, and only because
-- the probe used a UUID that did not exist.
--
-- Nothing in src/ or scripts/ references it (grepped for both parameter names).

drop function if exists public.increment_usage(uuid, integer);

-- The surviving 4-arg function is SECURITY INVOKER, so RLS on usage applies to
-- it and a direct call from a browser is already blocked (verified: 42501).
-- It only ever runs under the service-role client inside /api/evaluate.
-- Revoke the client-facing grants anyway — there is no reason for them.
revoke all on function public.increment_usage(uuid, date, integer, integer) from anon, authenticated;
