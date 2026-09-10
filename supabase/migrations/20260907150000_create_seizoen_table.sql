-- Seizoen table: een seizoen hoort bij één team; elke wedstrijd hoort bij
-- precies één seizoen (zie docs/datamodel.md). naam wordt automatisch
-- afgeleid uit de wedstrijddatum — geen seizoen-beheerscherm, zie
-- seizoenService.deriveSeasonLabel voor de regel.
--
-- De (team_id, naam) unique-constraint hieronder maakt
-- getOrCreateSeasonForDate's check-then-insert race-safe (zie die service).

create table if not exists public.seizoen (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.team (id) on delete cascade,
  naam text not null,
  start_datum date null,
  eind_datum date null,
  created_at timestamptz not null default now(),
  constraint seizoen_team_id_naam_key unique (team_id, naam)
);

comment on table public.seizoen is 'Eén seizoen (bv. "2025-2026") van één team. naam wordt automatisch afgeleid uit de wedstrijddatum, zie seizoenService.getOrCreateSeasonForDate. De unique-constraint op (team_id, naam) maakt get-or-create race-safe: zie die service voor de recovery-afhandeling van de resulterende 23505 unique-violation.';

-- Elke leeslijst filtert op team_id, en de RLS-policies hieronder joinen
-- erop; index het.
create index if not exists seizoen_team_id_idx on public.seizoen (team_id);

alter table public.seizoen enable row level security;

-- seizoen heeft (net als speler) geen coach_user_id kolom — een seizoen
-- hoort bij een team, niet rechtstreeks bij een coach. Daarom scopen de
-- policies hieronder via een EXISTS-subquery terug naar team.coach_user_id.

drop policy if exists "Coach kan seizoenen van eigen team lezen" on public.seizoen;
create policy "Coach kan seizoenen van eigen team lezen"
  on public.seizoen
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.team
      where team.id = seizoen.team_id
        and team.coach_user_id = (select auth.uid())
    )
  );

drop policy if exists "Coach kan seizoenen aan eigen team toevoegen" on public.seizoen;
create policy "Coach kan seizoenen aan eigen team toevoegen"
  on public.seizoen
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.team
      where team.id = seizoen.team_id
        and team.coach_user_id = (select auth.uid())
    )
  );

drop policy if exists "Coach kan seizoenen van eigen team bijwerken" on public.seizoen;
create policy "Coach kan seizoenen van eigen team bijwerken"
  on public.seizoen
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.team
      where team.id = seizoen.team_id
        and team.coach_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.team
      where team.id = seizoen.team_id
        and team.coach_user_id = (select auth.uid())
    )
  );

-- Bewust geen "for delete"-policy: er is geen ticket dat seizoenen laat
-- verwijderen (net zoals speler bewust geen delete-policy heeft). Zonder
-- delete-policy staat RLS delete voor 'authenticated' sowieso nergens toe.
