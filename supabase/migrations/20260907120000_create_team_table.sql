-- Team table: the coach's team(s).
--
-- Single-user today: exactly one coach per team. `coach_user_id` exists from
-- day one (per docs/datamodel.md) so a second coach/team is just another row
-- later, no redesign needed.
--
-- NOTE: `id` is a random uuid (not a sequential bigint identity) even though
-- that's normally the better default for write-heavy/large tables — this is
-- a deliberate exception because docs/datamodel.md fixes `team.id uuid pk`
-- as the shape every later ticket's foreign keys (seizoen, speler, ...) will
-- reference, and this table will only ever hold a handful of rows for a
-- single coach, so index fragmentation is not a concern at this scale.

create table if not exists public.team (
  id uuid primary key default gen_random_uuid(),
  coach_user_id uuid not null references auth.users (id) on delete cascade,
  naam text not null,
  created_at timestamptz not null default now()
);

comment on table public.team is 'De vaste groep kinderen die een coach coacht. coach_user_id scopet de rij via RLS.';

-- RLS policies read/write coach_user_id on every row, so index it.
create index if not exists team_coach_user_id_idx on public.team (coach_user_id);

alter table public.team enable row level security;

drop policy if exists "Coach kan eigen team(s) lezen" on public.team;
create policy "Coach kan eigen team(s) lezen"
  on public.team
  for select
  to authenticated
  using ((select auth.uid()) = coach_user_id);

drop policy if exists "Coach kan eigen team(s) aanmaken" on public.team;
create policy "Coach kan eigen team(s) aanmaken"
  on public.team
  for insert
  to authenticated
  with check ((select auth.uid()) = coach_user_id);

drop policy if exists "Coach kan eigen team(s) bijwerken" on public.team;
create policy "Coach kan eigen team(s) bijwerken"
  on public.team
  for update
  to authenticated
  using ((select auth.uid()) = coach_user_id)
  with check ((select auth.uid()) = coach_user_id);

drop policy if exists "Coach kan eigen team(s) verwijderen" on public.team;
create policy "Coach kan eigen team(s) verwijderen"
  on public.team
  for delete
  to authenticated
  using ((select auth.uid()) = coach_user_id);
