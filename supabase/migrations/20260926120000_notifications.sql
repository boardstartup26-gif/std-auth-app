-- In-app notifications, and the student's email-reminder preference.
--
-- One inbox for every return trigger. Spaced Reattempt Prompts write here now;
-- the Weekly Board Plan (October) will write here too. Email is a second
-- delivery route for the same row, tracked by emailed_at, so a reminder is
-- one fact whether the student sees it in the bell, the inbox, or their mail.
--
-- Access mirrors public.profiles: the student can SELECT their own rows, and
-- nothing client-side can write. Rows are created by the cron route and marked
-- read by server actions, both through the service-role client, keyed on a
-- verified user id.

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null,
  title       text not null,
  body        text not null,
  -- Internal path only (e.g. /evaluate?subject=…&q=…). Never an absolute URL:
  -- the inbox renders it as a link, and an off-site href there would be a
  -- phishing surface inside the product.
  href        text,
  -- Makes generation idempotent: the cron can run twice, or be retried, and a
  -- given prompt still exists once. e.g. reattempt:<student_answer_id>:<stage>
  dedupe_key  text not null,
  created_at  timestamptz not null default now(),
  read_at     timestamptz,
  emailed_at  timestamptz,
  constraint notifications_kind_check check (kind in ('reattempt', 'board_plan', 'system')),
  constraint notifications_href_internal check (href is null or (href like '/%' and href not like '//%')),
  constraint notifications_dedupe_unique unique (user_id, dedupe_key)
);

create index if not exists idx_notifications_user_created
  on public.notifications (user_id, created_at desc);
create index if not exists idx_notifications_user_unread
  on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (auth.uid() = user_id);

-- Opt-out, not opt-in: reminders are the product's return mechanism, and every
-- reminder email carries a one-click unsubscribe that flips this. In-app
-- notifications are unaffected by it.
alter table public.profiles
  add column if not exists email_reminders boolean not null default true;

comment on table public.notifications is
  'In-app inbox. Written only by the service role (cron + server actions); students SELECT their own.';
comment on column public.profiles.email_reminders is
  'false once the student unsubscribes from reminder emails (link in every reminder, or /account).';
