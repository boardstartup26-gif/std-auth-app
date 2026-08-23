-- Distinguishes WHY a question is diagram-related, which `diagram_required`
-- (a bare boolean) cannot express. Three cases behave differently in the UI:
--
--   'figure'        a scan of the printed figure is stored in diagram_url and
--                   renders inline; the question is answerable.
--   'physical_map'  the question depends on a Survey of India topographic map
--                   extract. Those sheets are not publicly available, so no
--                   image can be stored — the student is told to consult their
--                   physical map sheet. Still answerable.
--   'ocr_pending'   the question asks the student to DRAW. Blocked until
--                   handwriting/diagram recognition exists.
--
-- NULL means the question needs no figure at all.
--
-- Without this column the 'physical_map' case would have to be detected by
-- running a regex over question_text at render time, which breaks as soon as
-- a paper words the instruction differently.

alter table public.questions
  add column if not exists diagram_source text;

alter table public.questions
  drop constraint if exists questions_diagram_source_check;

alter table public.questions
  add constraint questions_diagram_source_check
  check (diagram_source is null or diagram_source in ('figure', 'physical_map', 'ocr_pending'));

comment on column public.questions.diagram_source is
  'Why the question is diagram-related: figure (image in diagram_url) | physical_map (Survey of India extract, not distributable) | ocr_pending (student must draw; blocked). NULL = no figure needed.';

-- Partial index: the evaluate page filters on this only for the small subset of
-- rows where it is set, so a full-column index would be mostly dead weight.
create index if not exists questions_diagram_source_idx
  on public.questions (diagram_source)
  where diagram_source is not null;
