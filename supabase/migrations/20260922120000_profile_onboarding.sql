-- Onboarding answers on public.profiles.
--
-- Columns only. No grant or policy changes: profiles still has no client write
-- path (see 20260904120000_analytics_events_and_profiles.sql), so these are
-- written by the /onboarding server action through the service-role client,
-- keyed on the verified session's user id — the same way role is protected.
--
-- Existing users get onboarded_at = null and are asked on their next visit.
-- That is intended: study_stage is what lets telemetry separate the Class 10
-- target from Class 11 beta testers and friends.

alter table public.profiles add column if not exists study_stage  text;
alter table public.profiles add column if not exists subjects     text[] not null default '{}';
alter table public.profiles add column if not exists heard_from   text;
alter table public.profiles add column if not exists onboarded_at timestamptz;

alter table public.profiles drop constraint if exists profiles_study_stage_check;
alter table public.profiles add constraint profiles_study_stage_check
  check (study_stage is null or study_stage in ('icse_10', 'icse_9', 'isc_11', 'isc_12', 'other_board'));

alter table public.profiles drop constraint if exists profiles_heard_from_check;
alter table public.profiles add constraint profiles_heard_from_check
  check (heard_from is null or heard_from in ('reddit', 'whatsapp', 'instagram', 'friend', 'school', 'search', 'other'));

create index if not exists idx_profiles_study_stage on public.profiles (study_stage);

comment on column public.profiles.study_stage is
  'Self-reported at onboarding. icse_10 is the target cohort; everything else is kept but segmented out of cohort metrics.';
comment on column public.profiles.onboarded_at is
  'Null until the student completes /onboarding. The (protected) layout redirects on null — UX only, never an access control.';
