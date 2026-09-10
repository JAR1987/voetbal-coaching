-- Speler table: de vaste spelerslijst van een team.
--
-- Een speler hoort bij het team, niet bij één seizoen (zie docs/datamodel.md)
-- — spelers blijven bruikbaar/koppelbaar over seizoensgrenzen heen. Spelers
-- die stoppen worden op status 'inactief' gezet, nooit verwijderd, zodat
-- historische opstelling/aanwezigheid-rijen altijd naar een geldige
-- speler-rij blijven verwijzen.

create table if not exists public.speler (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.team (id) on delete cascade,
  naam text not null,
  rugnummer int null,
  opmerkingen text null,
  status text not null default 'actief' check (status in ('actief', 'inactief')),
  created_at timestamptz not null default now()
);

comment on table public.speler is 'De spelerslijst van een team. Spelers die stoppen krijgen status=inactief in plaats van verwijderd te worden, zodat historie bewaard blijft.';

-- Elke leeslijst filtert op team_id, en de RLS-policies hieronder joinen
-- erop; index het.
create index if not exists speler_team_id_idx on public.speler (team_id);

alter table public.speler enable row level security;

-- speler heeft geen coach_user_id kolom (hoort bij een team, niet direct bij
-- een coach) — de policies hieronder scopen daarom via een EXISTS-subquery
-- terug naar team.coach_user_id.

drop policy if exists "Coach kan spelers van eigen team lezen" on public.speler;
create policy "Coach kan spelers van eigen team lezen"
  on public.speler
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.team
      where team.id = speler.team_id
        and team.coach_user_id = (select auth.uid())
    )
  );

drop policy if exists "Coach kan spelers aan eigen team toevoegen" on public.speler;
create policy "Coach kan spelers aan eigen team toevoegen"
  on public.speler
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.team
      where team.id = speler.team_id
        and team.coach_user_id = (select auth.uid())
    )
  );

drop policy if exists "Coach kan spelers van eigen team bijwerken" on public.speler;
create policy "Coach kan spelers van eigen team bijwerken"
  on public.speler
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.team
      where team.id = speler.team_id
        and team.coach_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.team
      where team.id = speler.team_id
        and team.coach_user_id = (select auth.uid())
    )
  );

-- Bewust geen "for delete"-policy: spelers worden nooit verwijderd (status
-- gaat naar 'inactief', zie docs/datamodel.md) — zonder policy staat RLS
-- delete voor 'authenticated' sowieso nergens toe.
