-- New grouping level above the existing free-text questions.topic (which is
-- fine-grained, e.g. "Absorption by roots") for the /evaluate question
-- picker's Chapter/Topic step. Intentionally a plain text column, not the
-- structured topics table (chapter_name/subtopic_name) — that table and
-- questions.topic_id are unpopulated and unused; this is a separate, simpler
-- mechanism. No backfill here: existing rows keep chapter = null and the UI
-- groups them into an "Other" bucket, filling in as future imports populate
-- this column.

alter table public.questions add column chapter text;

create index idx_questions_chapter on public.questions (subject_id, chapter);

-- questions uses per-column SELECT grants, not table-wide (see
-- 20260823170000_close_answer_key_and_quota_holes.sql) — a new column is
-- invisible to the browser client, and Postgres denies the whole SELECT if
-- any requested column isn't granted, until explicitly added here.
grant select (chapter) on public.questions to authenticated;
