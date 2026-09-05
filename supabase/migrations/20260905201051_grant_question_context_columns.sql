-- The per-column SELECT allowlist on public.questions (see
-- 20260823170000_close_answer_key_and_quota_holes.sql) fails closed by
-- design: a column added after that migration is invisible to clients until
-- explicitly granted here. That migration's own comment calls this out.
--
-- Seven columns were added to the questions table (History & Civics /
-- English Literature import batches — extract, stimulus, literary_work,
-- table_data, has_image, image_description, parent_question_number) to
-- render passage/extract/picture/table context above question_text in
-- /evaluate. None of these carry answer-key data — unlike correct_answer /
-- correct_option, which stay off this list on purpose — so there is no
-- reason to keep them out of the authenticated grant.
--
-- Without this, the browser-side query in evaluate/page.tsx that lists
-- "extract, stimulus, ..." alongside already-granted columns fails outright
-- ("permission denied for table questions") — Postgres denies the whole
-- SELECT when any requested column isn't granted, not just the missing
-- ones — which emptied the questions list for every subject and broke the
-- Type dropdown entirely.
--
-- GRANT SELECT (col_list) is additive: this does not touch the existing
-- column grant from 20260823170000, only adds to it.

grant select (
  has_image,
  image_description,
  extract,
  stimulus,
  literary_work,
  table_data,
  parent_question_number
) on public.questions to authenticated;
