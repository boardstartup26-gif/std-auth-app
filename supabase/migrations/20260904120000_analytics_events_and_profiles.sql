-- Product telemetry: public.analytics_events + the public.profiles.role
-- attribute the admin dashboard authorises against.
--
-- Threat model this migration is written against: a logged-in student is a
-- hostile client. They hold a real JWT and can call PostgREST directly with
-- the publishable key, so anything readable to `authenticated` is readable to
-- every student. Telemetry rows carry other users' behaviour, so SELECT is
-- closed to everyone except an admin, enforced in the database rather than in
-- the app layer.


-- ─── 1. profiles ─────────────────────────────────────────────────────────────
--
-- The project had no profiles table (the baseline dump has none), so this
-- creates it. Written to be idempotent in case one exists out-of-band: the
-- CREATE is guarded and each column is added separately.

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  first_name  text,
  last_name   text,
  role        text not null default 'student',
  created_at  timestamptz not null default now()
);

alter table public.profiles add column if not exists role text not null default 'student';
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists created_at timestamptz not null default now();

-- Constrain the role vocabulary. Without this a typo ('Admin', 'adminn')
-- silently produces an account that is neither student nor admin.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('student', 'admin'));

create index if not exists idx_profiles_role on public.profiles (role) where role <> 'student';

comment on column public.profiles.role is
  'Authorisation role. Defaults to student. Only ever promoted to admin by a service-role/SQL operator - no client-facing grant or policy can write this column.';


-- ─── 2. Role check helper ────────────────────────────────────────────────────
--
-- SECURITY DEFINER on purpose. A policy on profiles that queried profiles
-- directly would recurse (RLS re-evaluating itself); running the lookup as the
-- definer reads past RLS and terminates. It takes no argument - the subject is
-- always auth.uid(), so a caller cannot ask "is *this other user* an admin"
-- and use the answer as an oracle.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $fn$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$fn$;

alter function public.is_admin() owner to postgres;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

comment on function public.is_admin() is
  'True when the calling session belongs to a profile with role = admin. SECURITY DEFINER so RLS policies on profiles can call it without recursing.';


-- ─── 3. Profile provisioning ─────────────────────────────────────────────────
--
-- role is deliberately NOT read from raw_user_meta_data. That object is
-- attacker-controlled - signUp() sends it from the browser - so sourcing the
-- role from it would let anyone self-promote at signup. The column default
-- ('student') is the only value a new row ever gets.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
begin
  insert into public.profiles (id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(new.raw_user_meta_data ->> 'last_name', '')
  )
  on conflict (id) do nothing;
  return new;
exception
  when others then
    -- Never let profile bookkeeping break account creation. A missing profile
    -- degrades to "not an admin", which fails closed.
    raise log 'handle_new_user: could not provision profile for %: %', new.id, sqlerrm;
    return new;
end;
$fn$;

alter function public.handle_new_user() owner to postgres;
revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill everyone who signed up before this migration.
insert into public.profiles (id, email, first_name, last_name, created_at)
select
  u.id,
  u.email,
  nullif(u.raw_user_meta_data ->> 'first_name', ''),
  nullif(u.raw_user_meta_data ->> 'last_name', ''),
  coalesce(u.created_at, now())
from auth.users u
on conflict (id) do nothing;


-- ─── 4. profiles RLS ─────────────────────────────────────────────────────────

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin"
  on public.profiles
  for select
  to authenticated
  using (public.is_admin());

-- No INSERT/UPDATE/DELETE policy and no write grant, by design: privilege
-- escalation needs a policy AND a grant, and this table has neither. Rows are
-- written by the SECURITY DEFINER trigger above and by service-role callers,
-- both of which bypass RLS.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;


-- ─── 5. analytics_events ─────────────────────────────────────────────────────

create table if not exists public.analytics_events (
  id            bigint generated always as identity primary key,
  event_name    text not null,
  -- Nullable: pre-signup visitors are the top of the funnel and have no user.
  -- SET NULL on delete keeps aggregate counts intact when an account is
  -- removed while dropping the link back to the person.
  user_id       uuid references auth.users (id) on delete set null,
  -- Anonymous visitor id (localStorage). Survives signup, which is what makes
  -- "visitor -> signup" attributable without knowing who the visitor was.
  anon_id       text,
  -- Per-tab/visit id (sessionStorage). Session drops are measured on this.
  session_id    text,
  path          text,
  referrer      text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  properties    jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),

  constraint analytics_events_event_name_len   check (char_length(event_name) between 1 and 64),
  constraint analytics_events_anon_id_len      check (anon_id      is null or char_length(anon_id)      <= 64),
  constraint analytics_events_session_id_len   check (session_id   is null or char_length(session_id)   <= 64),
  constraint analytics_events_path_len         check (path         is null or char_length(path)         <= 512),
  constraint analytics_events_referrer_len     check (referrer     is null or char_length(referrer)     <= 1024),
  constraint analytics_events_utm_source_len   check (utm_source   is null or char_length(utm_source)   <= 128),
  constraint analytics_events_utm_medium_len   check (utm_medium   is null or char_length(utm_medium)   <= 128),
  constraint analytics_events_utm_campaign_len check (utm_campaign is null or char_length(utm_campaign) <= 128),
  constraint analytics_events_properties_obj   check (jsonb_typeof(properties) = 'object')
);

comment on table public.analytics_events is
  'Append-only product telemetry. INSERT is open to clients (that is the point of a beacon); SELECT is admin-only. Never add an UPDATE or DELETE policy.';

create index if not exists idx_analytics_events_event_name  on public.analytics_events (event_name);
create index if not exists idx_analytics_events_user_id     on public.analytics_events (user_id);
create index if not exists idx_analytics_events_created_at  on public.analytics_events (created_at desc);
-- The dashboard's hot path is always "this event, in this window".
create index if not exists idx_analytics_events_name_created on public.analytics_events (event_name, created_at desc);
create index if not exists idx_analytics_events_anon_id     on public.analytics_events (anon_id);
create index if not exists idx_analytics_events_session_id  on public.analytics_events (session_id);
create index if not exists idx_analytics_events_utm_source  on public.analytics_events (utm_source);
create index if not exists idx_analytics_events_properties  on public.analytics_events using gin (properties);


-- ─── 6. analytics_events RLS ─────────────────────────────────────────────────

alter table public.analytics_events enable row level security;

-- Start from zero. Supabase's default grants on the public schema hand anon
-- and authenticated full DML on every new table; that default is the whole
-- problem here, so it is revoked before anything is granted back.
revoke all on public.analytics_events from anon, authenticated;

-- Column-scoped INSERT. id and created_at are withheld deliberately: a client
-- that could set created_at could backdate or postdate events and poison every
-- window the dashboard computes.
grant insert (
  event_name,
  user_id,
  anon_id,
  session_id,
  path,
  referrer,
  utm_source,
  utm_medium,
  utm_campaign,
  properties
) on public.analytics_events to anon, authenticated;

grant select on public.analytics_events to authenticated;

drop policy if exists "analytics_events_insert_public" on public.analytics_events;
create policy "analytics_events_insert_public"
  on public.analytics_events
  for insert
  to anon, authenticated
  -- A client may write an anonymous row, or a row attributed to itself, and
  -- nothing else. Without this check any student could forge another user's
  -- activity and skew (or frame) their history.
  with check (user_id is null or user_id = auth.uid());

drop policy if exists "analytics_events_select_admin" on public.analytics_events;
create policy "analytics_events_select_admin"
  on public.analytics_events
  for select
  to authenticated
  using (public.is_admin());

-- Anonymous clients may write but never read: no SELECT grant, no SELECT
-- policy for anon. Both would have to exist for a read to succeed.
--
-- No UPDATE or DELETE policy exists, so telemetry is append-only for every
-- client. Retention pruning is a service-role/cron job, not a user action.


-- ─── 7. Bootstrapping the first admin ────────────────────────────────────────
--
-- Left commented on purpose: promoting an account is a production data change
-- and should be a deliberate act, not a side effect of running a migration.
-- Run it once from the Supabase SQL editor (or psql) against the real project:
--
--   update public.profiles set role = 'admin' where email = 'board.startup26@gmail.com';
--
-- Until some profile carries role = 'admin', /admin returns 404 to everyone
-- and analytics_events reads return zero rows. That is the intended fail-closed
-- state.
