-- Parent Report: an opt-in weekly progress summary to the parent or guardian
-- who confirmed consent (src/lib/parent-report).
--
-- Opt-in is the parent's, not the student's, and it is bound to the address
-- that opted in: `reports_enabled_for` stores that email, and a report is
-- sent only while it still equals parent_email (case-insensitively). If the
-- student later changes the parent address, the new parent has not opted in
-- and gets nothing until they do. This deliberately leaves the consent code
-- (requestParentConsent) untouched: no reset step to forget.
--
-- Eligibility to send = status 'confirmed' AND parent_email IS NOT NULL AND
-- lower(reports_enabled_for) = lower(parent_email). Read from these raw
-- columns, never from getParentConsentState(): the DISABLE_PARENT_CONSENT_GATE
-- kill switch reports every account as confirmed, including ones with no
-- parent email at all.
--
-- None of these columns is granted to the authenticated role: the existing
-- column-scoped SELECT grant on parent_consents stays as it was, and every
-- read and write here goes through the service-role client.

alter table public.parent_consents
  add column if not exists reports_enabled_for text,
  add column if not exists reports_enabled_at  timestamptz,
  add column if not exists report_last_sent_at timestamptz,
  -- Student-triggered "invite my parent" email, rate-limited on the row.
  add column if not exists report_invited_at   timestamptz;

alter table public.parent_consents drop constraint if exists parent_consents_reports_for_len;
alter table public.parent_consents add constraint parent_consents_reports_for_len
  check (reports_enabled_for is null or char_length(reports_enabled_for) between 3 and 320);

alter table public.parent_consents drop constraint if exists parent_consents_reports_enabled_at_check;
alter table public.parent_consents add constraint parent_consents_reports_enabled_at_check
  check (reports_enabled_for is null or reports_enabled_at is not null);

comment on column public.parent_consents.reports_enabled_for is
  'Parent email that opted in to weekly reports. Reports go out only while this equals parent_email. NULL = off.';
