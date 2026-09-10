-- Aanwezigheid table: aanwezigheids- en fitheid-status per (wedstrijd,
-- speler). Zie docs/datamodel.md.
--
-- Geen rij voor een (wedstrijd, speler)-paar betekent impliciet "aanwezig",
-- zonder fitheid — zie aanwezigheidService.listForMatch voor de merge-logica.
-- De unique-constraint hieronder is setStatus/setFitheid's upsert-target,
-- niet een race-guard voor een check-then-insert (er is geen check-stap).

create table if not exists public.aanwezigheid (
  id uuid primary key default gen_random_uuid(),
  wedstrijd_id uuid not null references public.wedstrijd (id) on delete cascade,
  speler_id uuid not null references public.speler (id) on delete cascade,
  status text not null default 'aanwezig' check (status in ('aanwezig', 'afgemeld')),
  fitheid_status text null check (fitheid_status in ('fit', 'let_op', 'geblesseerd')),
  created_at timestamptz not null default now(),
  constraint aanwezigheid_wedstrijd_id_speler_id_key unique (wedstrijd_id, speler_id)
);

comment on table public.aanwezigheid is 'Aanwezigheid + fitheid-status per (wedstrijd, speler). Geen rij voor een (wedstrijd, speler)-combinatie betekent impliciet "aanwezig" zonder fitheid-status — zie aanwezigheidService.listForMatch voor de merge-logica die dit toepast. De unique-constraint op (wedstrijd_id, speler_id) is het upsert-target van setStatus/setFitheid.';

-- Elke leeslijst filtert op wedstrijd_id; index het. (speler_id heeft al een
-- impliciete index via de FK + unique-constraint hierboven.)
create index if not exists aanwezigheid_wedstrijd_id_idx on public.aanwezigheid (wedstrijd_id);

alter table public.aanwezigheid enable row level security;

-- aanwezigheid heeft geen team_id/seizoen_id — policies joinen drie niveaus
-- diep: aanwezigheid -> wedstrijd -> seizoen -> team.coach_user_id.

drop policy if exists "Coach kan aanwezigheid van eigen team lezen" on public.aanwezigheid;
create policy "Coach kan aanwezigheid van eigen team lezen"
  on public.aanwezigheid
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.wedstrijd
      join public.seizoen on seizoen.id = wedstrijd.seizoen_id
      join public.team on team.id = seizoen.team_id
      where wedstrijd.id = aanwezigheid.wedstrijd_id
        and team.coach_user_id = (select auth.uid())
    )
  );

-- Zowel insert- als update-policy zijn nodig voor setStatus/setFitheid's
-- upsert (ON CONFLICT DO UPDATE kan, afhankelijk van of de rij al bestaat,
-- via elk van beide paden lopen).

drop policy if exists "Coach kan aanwezigheid voor eigen team toevoegen" on public.aanwezigheid;
create policy "Coach kan aanwezigheid voor eigen team toevoegen"
  on public.aanwezigheid
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.wedstrijd
      join public.seizoen on seizoen.id = wedstrijd.seizoen_id
      join public.team on team.id = seizoen.team_id
      where wedstrijd.id = aanwezigheid.wedstrijd_id
        and team.coach_user_id = (select auth.uid())
    )
  );

drop policy if exists "Coach kan aanwezigheid van eigen team bijwerken" on public.aanwezigheid;
create policy "Coach kan aanwezigheid van eigen team bijwerken"
  on public.aanwezigheid
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.wedstrijd
      join public.seizoen on seizoen.id = wedstrijd.seizoen_id
      join public.team on team.id = seizoen.team_id
      where wedstrijd.id = aanwezigheid.wedstrijd_id
        and team.coach_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.wedstrijd
      join public.seizoen on seizoen.id = wedstrijd.seizoen_id
      join public.team on team.id = seizoen.team_id
      where wedstrijd.id = aanwezigheid.wedstrijd_id
        and team.coach_user_id = (select auth.uid())
    )
  );

-- Bewust geen "for delete"-policy: afmelden is een update (status terug naar
-- 'aanwezig'), geen delete; zonder policy staat RLS delete dus nergens toe.
