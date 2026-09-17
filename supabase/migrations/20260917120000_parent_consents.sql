-- ─── parent_consents ─────────────────────────────────────────────────────────
--
-- Verifiable parental consent (DPDP Act, users under 18), interim standard:
-- a signed, expiring confirmation link emailed to a parent/guardian address.
--
-- One row per student. Every write happens server-side through the
-- service-role client (src/lib/parent-consent/*):
--
--   * signup / "enter parent email" prompt → row created or updated to
--     status 'pending' with a fresh token hash and expiry, email sent
--   * /parent-confirm (POST from the parent)  → status 'confirmed'
--   * expired link opened                     → status 'expired'
--   * withdrawal (manual, see bottom)         → status 'revoked'
--
-- The evaluation route (src/app/api/evaluate/route.ts) refuses any user whose
-- row is not 'confirmed' — before it reserves credits, reads the question, or
-- calls Anthropic. A missing row counts as not confirmed.
--
-- The raw token is never stored: only its SHA-256, so a database read cannot
-- be turned into a working confirmation link.

create table if not exists public.parent_consents (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null unique references auth.users (id) on delete cascade,
  -- Null until the student supplies it. Existing beta users are backfilled
  -- in this state and prompted on next login.
  parent_email            text,
  verification_token_hash text,
  token_expires_at        timestamptz,
  status                  text not null default 'pending',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  confirmed_at            timestamptz,
  revoked_at              timestamptz,
  -- Resend rate limiting lives on the row, not in process memory, so it holds
  -- across serverless instances.
  last_sent_at            timestamptz,
  send_count              integer not null default 0,
  send_window_started_at  timestamptz,

  constraint parent_consents_status_check
    check (status in ('pending', 'confirmed', 'expired', 'revoked')),
  constraint parent_consents_confirmed_at_check
    check (status <> 'confirmed' or confirmed_at is not null),
  constraint parent_consents_revoked_at_check
    check (status <> 'revoked' or revoked_at is not null),
  constraint parent_consents_email_len
    check (parent_email is null or char_length(parent_email) between 3 and 320),
  constraint parent_consents_send_count_nonneg
    check (send_count >= 0)
);

comment on table public.parent_consents is
  'Verifiable parental consent per student. Server-written only. Evaluation access requires status = confirmed.';

create index if not exists idx_parent_consents_status on public.parent_consents (status);


-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table public.parent_consents enable row level security;

-- Start from zero (Supabase's default public-schema grants give full DML).
revoke all on public.parent_consents from anon, authenticated;

-- Column-scoped read: a student may see their own status and where the link
-- went, but not the token hash. No INSERT/UPDATE/DELETE grant or policy for
-- any client role — a student who could write this row could confirm
-- themselves.
grant select (
  id,
  user_id,
  parent_email,
  status,
  created_at,
  updated_at,
  confirmed_at,
  revoked_at,
  token_expires_at,
  last_sent_at
) on public.parent_consents to authenticated;

drop policy if exists "parent_consents_select_own" on public.parent_consents;
create policy "parent_consents_select_own"
  on public.parent_consents
  for select
  to authenticated
  using (user_id = (select auth.uid()));


-- ─── Backfill existing users ─────────────────────────────────────────────────
--
-- Every account that exists today gets a pending row with no parent email.
-- They keep their dashboard and history; new evaluations are locked until a
-- parent confirms. Nobody is logged out and nothing is deleted.
--
-- Note this includes admin/founder accounts. To exempt one deliberately (e.g.
-- an adult test account), confirm it by hand — see the manual actions below.

insert into public.parent_consents (user_id, status)
select u.id, 'pending'
from auth.users u
on conflict (user_id) do nothing;


-- ─── Manual admin actions (run in the SQL editor as service role) ────────────
--
-- WITHDRAWAL — a parent emails the grievance address asking to withdraw.
-- Verify the request comes from the parent_email on file (reply to that
-- address, not to a different one), then:
--
--   update public.parent_consents
--      set status = 'revoked',
--          revoked_at = now(),
--          verification_token_hash = null,
--          token_expires_at = null,
--          updated_at = now()
--    where user_id = '<student auth user id>';
--
-- Evaluations re-lock immediately (the route reads this row on every request).
-- The student cannot re-request consent from a revoked state in the app; if
-- the parent later asks for the account to be deleted, delete the auth user
-- (cascades to answers, evaluations, usage, feedback and this row).
--
-- Find the user id from the parent's email:
--
--   select user_id, status, confirmed_at from public.parent_consents
--    where lower(parent_email) = lower('<parent email>');
--
-- REINSTATE after a revoke (only on the parent's own request):
--
--   update public.parent_consents
--      set status = 'pending', revoked_at = null, updated_at = now()
--    where user_id = '<student auth user id>';
--
-- (The student then resends the link from the app; the parent confirms again.)
