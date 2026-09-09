-- Opstelling table: speler-toewijzingen per (wedstrijd, kwart, positie),
-- incl. score/opmerking voor die combinatie. Zie docs/datamodel.md en
-- ticket jt-dvh.14.5. Geen rij voor een aanwezige speler dat kwart = wissel
-- (zie opstellingService, geen aparte wisselbank-opslag).

create table if not exists public.opstelling (
  id uuid primary key default gen_random_uuid(),
  wedstrijd_id uuid not null references public.wedstrijd (id) on delete cascade,
  kwart int not null check (kwart between 1 and 4),
  speler_id uuid not null references public.speler (id) on delete cascade,
  positie text not null,
  score int null check (score between 1 and 5),
  opmerking text null,
  created_at timestamptz not null default now(),
  constraint opstelling_wedstrijd_kwart_speler_key unique (wedstrijd_id, kwart, speler_id),
  constraint opstelling_wedstrijd_kwart_positie_key unique (wedstrijd_id, kwart, positie)
);

comment on table public.opstelling is 'Eén rij per (wedstrijd, kwart, speler) zodra die speler een positie krijgt. Geen rij = wissel dat kwart. De twee unique-constraints borgen hoogstens één positie per speler en hoogstens één speler per positie, per kwart.';

create index if not exists opstelling_wedstrijd_id_idx on public.opstelling (wedstrijd_id);

alter table public.opstelling enable row level security;

-- Zelfde drie-niveaus-diepe join als aanwezigheid: opstelling -> wedstrijd ->
-- seizoen -> team.coach_user_id (opstelling heeft zelf geen team_id/
-- seizoen_id).

drop policy if exists "Coach kan opstelling van eigen team lezen" on public.opstelling;
create policy "Coach kan opstelling van eigen team lezen"
  on public.opstelling
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.wedstrijd
      join public.seizoen on seizoen.id = wedstrijd.seizoen_id
      join public.team on team.id = seizoen.team_id
      where wedstrijd.id = opstelling.wedstrijd_id
        and team.coach_user_id = (select auth.uid())
    )
  );

drop policy if exists "Coach kan opstelling voor eigen team toevoegen" on public.opstelling;
create policy "Coach kan opstelling voor eigen team toevoegen"
  on public.opstelling
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.wedstrijd
      join public.seizoen on seizoen.id = wedstrijd.seizoen_id
      join public.team on team.id = seizoen.team_id
      where wedstrijd.id = opstelling.wedstrijd_id
        and team.coach_user_id = (select auth.uid())
    )
  );

drop policy if exists "Coach kan opstelling van eigen team bijwerken" on public.opstelling;
create policy "Coach kan opstelling van eigen team bijwerken"
  on public.opstelling
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.wedstrijd
      join public.seizoen on seizoen.id = wedstrijd.seizoen_id
      join public.team on team.id = seizoen.team_id
      where wedstrijd.id = opstelling.wedstrijd_id
        and team.coach_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.wedstrijd
      join public.seizoen on seizoen.id = wedstrijd.seizoen_id
      join public.team on team.id = seizoen.team_id
      where wedstrijd.id = opstelling.wedstrijd_id
        and team.coach_user_id = (select auth.uid())
    )
  );

-- Bewust geen "for delete"-policy: opstellingService verplaatst/wisselt
-- spelers altijd via insert/update (zie die service), nooit een delete.
