-- Practice papers ("Question Set Generator") and difficulty estimates.
--
-- 1. questions.difficulty_estimate
--    The existing difficulty_flag is not usable: 126 of 2,456 rows carry it and
--    every one says "high" (copied from one importer's source JSON). This is a
--    separate column so the estimate is never mistaken for source data. It is
--    filled by scripts/label-difficulty.mjs (a one-off Claude pass over each
--    question and its official scheme) and is shown to students as an
--    estimate. Once enough real scores exist it should be replaced by
--    difficulty derived from how students actually score.
--
-- 2. public.practice_sets
--    A practice paper a student built: an ordered list of real past-paper
--    question ids plus the choices that produced it. Same access shape as
--    notifications and profiles: the student SELECTs their own rows; there is
--    no client write path. Rows are created by a server action through the
--    service-role client, keyed on the verified session user.

alter table public.questions
  add column if not exists difficulty_estimate text,
  add column if not exists difficulty_estimated_at timestamptz,
  add column if not exists difficulty_estimate_source text;

alter table public.questions drop constraint if exists questions_difficulty_estimate_check;
alter table public.questions add constraint questions_difficulty_estimate_check
  check (difficulty_estimate is null or difficulty_estimate in ('easy', 'medium', 'hard'));

comment on column public.questions.difficulty_estimate is
  'Estimated difficulty for an ICSE Class 10 student (easy/medium/hard). An estimate, not source data: see difficulty_estimate_source.';

create table if not exists public.practice_sets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  subject      text not null,
  -- What the student asked for (counts per type, target marks, difficulty,
  -- chapters), kept so a set can be explained and rebuilt.
  spec         jsonb not null default '{}'::jsonb,
  question_ids uuid[] not null,
  total_marks  numeric not null,
  created_at   timestamptz not null default now(),
  constraint practice_sets_not_empty check (cardinality(question_ids) between 1 and 40)
);

create index if not exists idx_practice_sets_user_created
  on public.practice_sets (user_id, created_at desc);

alter table public.practice_sets enable row level security;

revoke all on public.practice_sets from anon, authenticated;
grant select on public.practice_sets to authenticated;

drop policy if exists practice_sets_select_own on public.practice_sets;
create policy practice_sets_select_own on public.practice_sets
  for select to authenticated
  using (auth.uid() = user_id);

comment on table public.practice_sets is
  'Student-built practice papers of real PYQs. Written only by the service role (server action); students SELECT their own.';
