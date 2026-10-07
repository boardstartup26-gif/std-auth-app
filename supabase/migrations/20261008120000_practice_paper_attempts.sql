-- Practice papers become a full exam attempt: the student answers the whole
-- paper in one place, answers autosave as drafts, nothing is marked until the
-- paper is submitted, and then the whole paper is marked together.
--
-- 1. practice_sets gains a lifecycle:
--      in_progress -> marking -> marked
--    started_at is when the student pressed Start; submitted_at when the paper
--    was handed in (credits are reserved at that moment, once, for the whole
--    paper); marked_at / score once every answer has been dealt with.
--
-- 2. public.practice_set_answers holds one row per (paper, question): the
--    draft answer while the paper is open, and afterwards the link to the
--    student_answers row the marking produced (so /history, mastery and the
--    reattempt prompts see paper answers exactly like single-question ones).
--    mark_state drives the marker:
--      draft    - being written; the paper is still open
--      pending  - submitted, waiting to be marked
--      grading  - claimed by a marker run (claimed_at); a claim older than a
--                 few minutes is treated as abandoned and re-claimed
--      marked   - student_answer_id points at the result
--      failed   - couldn't be marked; its credit was refunded
--      skipped  - left blank; scores zero, costs nothing
--
-- Same access shape as practice_sets: the student SELECTs their own rows, and
-- every write goes through server code using the service-role client, keyed
-- on the verified session user. There is no client write path.

alter table public.practice_sets
  add column if not exists status text not null default 'in_progress',
  add column if not exists started_at timestamptz,
  add column if not exists submitted_at timestamptz,
  add column if not exists marked_at timestamptz,
  add column if not exists score numeric,
  add column if not exists marked_total numeric;

alter table public.practice_sets drop constraint if exists practice_sets_status_check;
alter table public.practice_sets add constraint practice_sets_status_check
  check (status in ('in_progress', 'marking', 'marked'));

comment on column public.practice_sets.marked_total is
  'Marks the score is out of: the paper total minus any answers that could not be marked.';

create table if not exists public.practice_set_answers (
  set_id            uuid not null references public.practice_sets (id) on delete cascade,
  question_id       uuid not null references public.questions (id) on delete cascade,
  user_id           uuid not null references auth.users (id) on delete cascade,
  answer_text       text not null default '',
  flagged           boolean not null default false,
  mark_state        text not null default 'draft',
  claimed_at        timestamptz,
  student_answer_id uuid references public.student_answers (id) on delete set null,
  updated_at        timestamptz not null default now(),
  primary key (set_id, question_id),
  constraint practice_set_answers_length check (char_length(answer_text) <= 12000),
  constraint practice_set_answers_state_check
    check (mark_state in ('draft', 'pending', 'grading', 'marked', 'failed', 'skipped'))
);

create index if not exists idx_practice_set_answers_user
  on public.practice_set_answers (user_id);

alter table public.practice_set_answers enable row level security;

revoke all on public.practice_set_answers from anon, authenticated;
grant select on public.practice_set_answers to authenticated;

drop policy if exists practice_set_answers_select_own on public.practice_set_answers;
create policy practice_set_answers_select_own on public.practice_set_answers
  for select to authenticated
  using (auth.uid() = user_id);

comment on table public.practice_set_answers is
  'Draft and submitted answers for a practice paper. Written only by the service role; students SELECT their own.';
