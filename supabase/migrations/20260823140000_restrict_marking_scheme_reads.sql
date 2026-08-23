-- Stop students reading the answer key before they answer.
--
-- The previous policy was:
--     CREATE POLICY marking_schemes_read_authenticated ON public.marking_schemes
--       FOR SELECT TO authenticated USING (true);
--
-- Any logged-in user could pull scheme_text, key_points and model_answer for
-- EVERY question straight from the browser, which defeats the point of being
-- graded against a scheme. Grading itself is unaffected: /api/evaluate reads
-- through createAdminClient() (service role), which bypasses RLS.
--
-- Two things still need to work for ordinary users, and they need different
-- treatment because RLS gates rows, not columns:
--
--   1. Total marks, BEFORE answering — the /evaluate sheet header prints
--      "2 marks" next to the question. This isn't secret; the real paper
--      prints it in the margin. Exposed through a view carrying only that
--      column, so no policy has to open the row.
--   2. The full scheme, AFTER answering — /history/[id] shows the model
--      answer for a submission the student already made. Gated on an actual
--      attempt existing.

drop policy if exists "marking_schemes_read_authenticated" on public.marking_schemes;

-- A student may read the scheme for a question they have actually attempted.
create policy "marking_schemes_read_after_attempt"
  on public.marking_schemes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.student_answers sa
      where sa.question_id = marking_schemes.question_id
        and sa.user_id = auth.uid()
    )
  );

-- Marks-only projection. Deliberately a DEFINER view (security_invoker off,
-- which is the default): it must read past the policy above so an unattempted
-- question can still show its mark count. It selects no other column, so
-- nothing about the answer travels with it.
create or replace view public.question_marks as
  select question_id, total_marks
  from public.marking_schemes;

alter view public.question_marks set (security_invoker = off);

revoke all on public.question_marks from anon, authenticated;
grant select on public.question_marks to authenticated;

comment on view public.question_marks is
  'Marks per question, readable before the question is attempted. Exists so the evaluate sheet can print a mark count without opening marking_schemes rows, which carry the model answer.';

-- Defence in depth: the baseline schema granted ALL on marking_schemes to
-- anon and authenticated. RLS already blocks writes (no INSERT/UPDATE/DELETE
-- policy exists), but there is no reason for the privilege to be held.
revoke insert, update, delete, truncate on public.marking_schemes from anon, authenticated;
revoke select on public.marking_schemes from anon;
