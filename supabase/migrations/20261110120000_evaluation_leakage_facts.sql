-- Phase 1 of the progress features (Leakage Map, Reattempt Gain, Marks
-- Recovered Streak, Fix List, Weekly Board Plan, Parent Report).
--
-- 1. evaluations.marking_points — schema drift repair.
--    The column exists in production (written by persistSubmission since the
--    marking-points rework) but no migration in this repo ever created it, so
--    a fresh database built from supabase/migrations/ could not save a graded
--    answer. `if not exists` makes this a no-op on production.
--
-- 2. evaluations.icse_style_issues — keep what the grader already reports.
--    The examiner prompt has always returned icse_style_issues (sound
--    understanding, but presentation or prescribed terminology that would cost
--    marks in a board script). persistSubmission discarded it. It is the only
--    source for the Leakage Map's "presentation & terminology" reason.
--
--    Deliberately NULLABLE WITH NO DEFAULT. A default of '[]' would make every
--    existing row read as "graded, no presentation issues", which is false —
--    those rows were never recorded. NULL means "not tracked for this
--    evaluation"; an array (possibly empty) means it was. The progress module
--    relies on that distinction to say "tracked since …" instead of inventing
--    a clean record for old answers. No backfill is possible: the grader's
--    output for old rows was never stored.
--
-- No RLS change: both columns sit on evaluations, whose existing
-- select-own-via-answer policy already covers them, and every write goes
-- through the service-role client in persistSubmission.

alter table public.evaluations
  add column if not exists marking_points jsonb;

alter table public.evaluations
  add column if not exists icse_style_issues jsonb;

alter table public.evaluations drop constraint if exists evaluations_icse_style_issues_is_array;
alter table public.evaluations add constraint evaluations_icse_style_issues_is_array
  check (icse_style_issues is null or jsonb_typeof(icse_style_issues) = 'array');

comment on column public.evaluations.icse_style_issues is
  'Presentation/terminology issues reported by the examiner prompt. NULL = not recorded (rows before 2026-11); [] = recorded, none found.';
