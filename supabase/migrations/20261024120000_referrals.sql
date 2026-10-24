-- Referral program: a personal invite link per student, attribution at signup,
-- and a permanent weekly credit bonus for both sides once the invited friend
-- has had two written answers marked.
--
-- 1. profiles.referral_code — the student's personal code (/i/{code}). Set
--    lazily by server code (service role), never by the client.
--
-- 2. public.referrals — one row per invited student (referee_id is unique: a
--    student can only ever be invited once). Lifecycle:
--      pending    - signed up through a link; written_marked counts up
--      qualified  - reached QUALIFY_AT written answers; bonuses granted
--      flagged    - looked like self-referral or a burst; never auto-rewarded
--      void       - cancelled by hand (abuse review)
--    written_marked is advanced only through referral_record_written_answer(),
--    which increments and qualifies in one statement so two answers saved at
--    the same moment can't both "be the second".
--
-- 3. public.credit_bonuses — a ledger of weekly-limit increases. The effective
--    weekly limit is WEEKLY_CREDIT_LIMIT + min(cap, sum of active rows), worked
--    out in src/lib/credits.ts and passed to increment_usage as p_limit — the
--    RPC itself is unchanged. unique (referral_id, user_id) makes granting
--    idempotent.
--
-- 4. student_answers.input_method — typed or handwritten, for the first-week
--    checklist and to measure handwritten use. Null on rows from before this.
--
-- Same access shape as notifications/practice_sets: students SELECT their own
-- rows; every write goes through server code using the service-role client,
-- keyed on a verified user id. No client write path.

alter table public.profiles
  add column if not exists referral_code text;

create unique index if not exists profiles_referral_code_key
  on public.profiles (referral_code);

alter table public.profiles drop constraint if exists profiles_referral_code_format;
alter table public.profiles add constraint profiles_referral_code_format
  check (referral_code is null or referral_code ~ '^[A-HJ-NP-Z2-9]{6}$');

alter table public.student_answers
  add column if not exists input_method text;

alter table public.student_answers drop constraint if exists student_answers_input_method_check;
alter table public.student_answers add constraint student_answers_input_method_check
  check (input_method is null or input_method in ('typed', 'handwritten'));

create table if not exists public.referrals (
  id             uuid primary key default gen_random_uuid(),
  referrer_id    uuid not null references auth.users (id) on delete cascade,
  referee_id     uuid not null unique references auth.users (id) on delete cascade,
  code           text not null,
  status         text not null default 'pending',
  written_marked int  not null default 0,
  flag_reason    text,
  signup_anon_id text,
  created_at     timestamptz not null default now(),
  qualified_at   timestamptz,
  constraint referrals_not_self check (referrer_id <> referee_id),
  constraint referrals_status_check
    check (status in ('pending', 'qualified', 'flagged', 'void'))
);

create index if not exists idx_referrals_referrer on public.referrals (referrer_id, created_at desc);

alter table public.referrals enable row level security;

revoke all on public.referrals from anon, authenticated;
grant select on public.referrals to authenticated;

drop policy if exists referrals_select_own on public.referrals;
create policy referrals_select_own on public.referrals
  for select to authenticated
  using (auth.uid() = referrer_id or auth.uid() = referee_id);

comment on table public.referrals is
  'Who invited whom. Written only by the service role; each side SELECTs its own rows.';

create table if not exists public.credit_bonuses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  weekly_amount int  not null,
  reason        text not null,
  referral_id   uuid references public.referrals (id) on delete set null,
  expires_at    timestamptz,
  created_at    timestamptz not null default now(),
  constraint credit_bonuses_amount_check check (weekly_amount > 0),
  constraint credit_bonuses_reason_check
    check (reason in ('referral_referrer', 'referral_referee', 'admin')),
  constraint credit_bonuses_once_per_referral unique (referral_id, user_id)
);

create index if not exists idx_credit_bonuses_user on public.credit_bonuses (user_id);

alter table public.credit_bonuses enable row level security;

revoke all on public.credit_bonuses from anon, authenticated;
grant select on public.credit_bonuses to authenticated;

drop policy if exists credit_bonuses_select_own on public.credit_bonuses;
create policy credit_bonuses_select_own on public.credit_bonuses
  for select to authenticated
  using (auth.uid() = user_id);

comment on table public.credit_bonuses is
  'Weekly credit-limit increases (null expires_at = permanent). Written only by the service role.';

-- Counts one more marked written answer for a pending referral and, on the
-- p_qualify_at-th, flips it to qualified — in a single UPDATE, so concurrent
-- saves serialise on the row lock and exactly one caller sees the transition.
-- Returns the referral row only to that caller (newly_qualified = true) or the
-- updated progress otherwise; no row when the student has no pending referral.
create or replace function public.referral_record_written_answer(
  p_referee_id uuid,
  p_qualify_at int
)
returns table (
  referral_id     uuid,
  referrer_id     uuid,
  written_marked  int,
  newly_qualified boolean
)
language sql
security definer
set search_path = public
as $$
  update public.referrals r
     set written_marked = r.written_marked + 1,
         status        = case when r.written_marked + 1 >= p_qualify_at then 'qualified' else r.status end,
         qualified_at  = case when r.written_marked + 1 >= p_qualify_at then now() else r.qualified_at end
   where r.referee_id = p_referee_id
     and r.status = 'pending'
  returning r.id, r.referrer_id, r.written_marked, r.status = 'qualified';
$$;

revoke all on function public.referral_record_written_answer(uuid, int) from public, anon, authenticated;
grant execute on function public.referral_record_written_answer(uuid, int) to service_role;

-- Flagged referrals still count progress so the admin review can see whether
-- the friend was real; they just never auto-reward.
create or replace function public.referral_record_flagged_progress(p_referee_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.referrals
     set written_marked = written_marked + 1
   where referee_id = p_referee_id
     and status = 'flagged';
$$;

revoke all on function public.referral_record_flagged_progress(uuid) from public, anon, authenticated;
grant execute on function public.referral_record_flagged_progress(uuid) to service_role;

-- ─── Runbook ────────────────────────────────────────────────────────────────
-- Approve a flagged referral after review (grants are then issued the next
-- time the friend gets a written answer marked, or immediately by hand):
--   update public.referrals set status = 'pending', flag_reason = null
--    where id = '<referral id>';
-- Void one and remove what it granted:
--   update public.referrals set status = 'void' where id = '<referral id>';
--   delete from public.credit_bonuses where referral_id = '<referral id>';
