-- ─── policy_consents ─────────────────────────────────────────────────────────
--
-- One row per (user, document, version) a user has accepted. Written only by
-- the server — src/lib/legal/consent.ts, called from the signup server action
-- and the Google OAuth callback — through the service-role client, with the
-- user id taken from Supabase's own signUp / code-exchange response and the
-- version taken from src/lib/legal/policies.ts. Nothing about a consent row
-- is ever sourced from the browser.
--
-- Clients may read their own rows and nothing else. There is no INSERT,
-- UPDATE or DELETE policy or grant for anon/authenticated: a consent record a
-- user could write or edit themselves would prove nothing.

create table if not exists public.policy_consents (
  id              bigint generated always as identity primary key,
  -- CASCADE, consistent with student_answers / usage / usage_feedback: an
  -- erasure request under the DPDP Act removes the consent trail with the
  -- account. If counsel advises retaining proof of consent after erasure,
  -- change this to SET NULL deliberately rather than dropping the FK.
  user_id         uuid not null references auth.users (id) on delete cascade,
  consent_type    text not null,
  policy_version  text not null,
  -- How consent was given: the email signup form's required checkbox, or the
  -- "by continuing you agree" notice beside Continue with Google. Not in the
  -- original spec, but without it two very different consent flows would be
  -- indistinguishable in the record.
  method          text not null,
  accepted_at     timestamptz not null default now(),

  constraint policy_consents_type_check    check (consent_type in ('terms', 'privacy')),
  constraint policy_consents_method_check  check (method in ('email_signup', 'google_oauth')),
  constraint policy_consents_version_len   check (char_length(policy_version) between 1 and 32),
  -- Makes the server write idempotent: a replayed OAuth callback or a
  -- double-submitted form records nothing new.
  constraint policy_consents_unique_accept unique (user_id, consent_type, policy_version)
);

comment on table public.policy_consents is
  'Server-written record of Terms/Privacy acceptance. Users can SELECT their own rows only; no client write path exists by design.';

-- "Latest accepted version of X for this user" is the only query shape a
-- future re-consent check needs.
create index if not exists idx_policy_consents_user_type
  on public.policy_consents (user_id, consent_type, accepted_at desc);


-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table public.policy_consents enable row level security;

-- Start from zero: Supabase's default public-schema grants give anon and
-- authenticated full DML on new tables.
revoke all on public.policy_consents from anon, authenticated;
grant select on public.policy_consents to authenticated;

drop policy if exists "policy_consents_select_own" on public.policy_consents;
create policy "policy_consents_select_own"
  on public.policy_consents
  for select
  to authenticated
  using (user_id = (select auth.uid()));
