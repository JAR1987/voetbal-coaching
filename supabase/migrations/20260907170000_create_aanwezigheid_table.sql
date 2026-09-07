-- Aanwezigheid table: aanwezigheids- en fitheid-status per (wedstrijd,
-- speler). Zie ticket "Aanwezigheid + fitheid-status" (jt-dvh.14.4) en
-- docs/datamodel.md.
--
-- Belangrijke ontwerpbeslissing — "geen rij = aanwezig": standaard staat elke
-- actieve speler op "aanwezig" zonder fitheid-status, zonder dat daarvoor
-- een rij in deze tabel hoeft te bestaan. Er wordt dus NIET vooraf een rij
-- per (wedstrijd, speler) aangemaakt zodra een wedstrijd wordt aangemaakt —
-- een rij ontstaat pas op het moment dat de coach iets wijzigt (iemand
-- afmeldt, of een fitheid-status zet). Zie
-- aanwezigheidService.listForMatch (src/data/aanwezigheidService.ts) voor de
-- merge-logica aan de leeskant die dit toepast (de actieve spelerslijst van
-- het team samenvoegen met de rijen die hier wel bestaan, met "aanwezig" als
-- default voor de rest).
--
-- Dat maakt setStatus/setFitheid ook geen check-then-insert: het is een
-- upsert op de unique-constraint hieronder (net als de datamodel-beslissing
-- het beschrijft: "een natural upsert target, geen race-prone
-- check-then-insert"). De constraint is dus niet nodig om een race te
-- voorkomen (er is geen aparte check-stap die verloren kan gaan), maar wel
-- voor data-integriteit — nooit twee rijen voor dezelfde
-- (wedstrijd, speler)-combinatie — en staat daarom, net als bij `seizoen`,
-- meteen in déze eerste migratie, niet als latere follow-up.

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

-- Elke leeslijst filtert op wedstrijd_id, en de RLS-policies hieronder
-- joinen erop; index het. (speler_id heeft al een impliciete index via de
-- foreign key + de unique-constraint hierboven, dus geen aparte index
-- nodig.)
create index if not exists aanwezigheid_wedstrijd_id_idx on public.aanwezigheid (wedstrijd_id);

alter table public.aanwezigheid enable row level security;

-- aanwezigheid heeft geen team_id/seizoen_id van zichzelf (het hoort bij een
-- wedstrijd, die op zijn beurt bij een seizoen hoort, dat weer bij een team
-- hoort), dus de policies hieronder joinen drie niveaus diep:
-- aanwezigheid -> wedstrijd -> seizoen -> team.coach_user_id — één stap
-- verder dan wedstrijd's eigen twee-niveaus-diepe join (zie
-- 20260907160000_create_wedstrijd_table.sql).

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

-- Bewust geen "for delete"-policy: geen ticket vraagt om aanwezigheid-rijen
-- te kunnen verwijderen — afmelden/weer aanwezig zetten is een update
-- (status teruggeschreven naar 'aanwezig'), geen delete. Zonder
-- delete-policy staat RLS delete voor 'authenticated' sowieso nergens toe.
