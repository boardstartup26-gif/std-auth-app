-- Weekly Board Plan: three tasks per student per week, chosen from their own
-- marked answers (src/lib/board-plan).
--
-- One row per student per IST week (Monday start). The tasks are fixed when
-- the row is created — a plan that rewrote itself mid-week as new answers
-- arrived would never be finishable. Progress on each task is NOT stored: it
-- is derived on read from student_answers submitted after created_at, so a
-- task can only be marked done by actually doing it, and there is no client
-- write path to protect.
--
-- Created by the weekly cron (/api/cron/weekly) or lazily when the student
-- opens the dashboard; the unique key makes both idempotent and race-safe
-- (insert … on conflict do nothing, then read).
--
-- Access mirrors public.notifications: students SELECT their own rows, and
-- nothing client-side can write. All writes go through the service-role
-- client keyed on a verified user id.

create table if not exists public.weekly_plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- Monday of the IST week this plan covers (lib/progress weekStartIST).
  week_start  date not null,
  tasks       jsonb not null,
  created_at  timestamptz not null default now(),
  -- Set once the plan email has gone out, so a re-run never sends it twice.
  emailed_at  timestamptz,
  constraint weekly_plans_user_week_unique unique (user_id, week_start),
  constraint weekly_plans_week_is_monday check (extract(isodow from week_start) = 1),
  constraint weekly_plans_tasks_array check (
    jsonb_typeof(tasks) = 'array' and jsonb_array_length(tasks) between 1 and 3
  )
);

create index if not exists idx_weekly_plans_user_week
  on public.weekly_plans (user_id, week_start desc);

alter table public.weekly_plans enable row level security;

revoke all on public.weekly_plans from anon, authenticated;
grant select on public.weekly_plans to authenticated;

drop policy if exists weekly_plans_select_own on public.weekly_plans;
create policy weekly_plans_select_own on public.weekly_plans
  for select to authenticated
  using (auth.uid() = user_id);

comment on table public.weekly_plans is
  'Weekly Board Plan. Tasks fixed at creation; progress derived from student_answers after created_at. Written only by the service role.';
