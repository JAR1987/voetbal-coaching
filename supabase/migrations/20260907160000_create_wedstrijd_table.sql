-- Wedstrijd table: één rij per wedstrijd. Formaat en formatie liggen vast
-- voor de hele wedstrijd (zie docs/datamodel.md — formatie is niet per
-- kwart), gekozen bij het aanmaken (zie ticket "Wedstrijd aanmaken +
-- formatie kiezen", jt-dvh.14.3).
--
-- tegenstander/eigen_score/tegen_score/thuis_uit staan hier al bij, maar
-- worden in dit ticket nog niet door de UI ingevuld — dat is de latere
-- ticket "Wedstrijdgegevens vastleggen". De kolommen (en de update-policy
-- hieronder) bestaan nu al zodat die latere ticket alleen UI hoeft toe te
-- voegen, niet nog een migratie.

create table if not exists public.wedstrijd (
  id uuid primary key default gen_random_uuid(),
  seizoen_id uuid not null references public.seizoen (id) on delete cascade,
  datum date not null,
  formaat text not null check (formaat in ('8v8', '11v11')),
  formatie text not null check (formatie in ('1-3-3-1', '1-2-3-2', '1-4-3-3', '1-4-4-2')),
  tegenstander text null,
  eigen_score int null,
  tegen_score int null,
  thuis_uit text null check (thuis_uit in ('thuis', 'uit')),
  created_at timestamptz not null default now(),
  -- wedstrijdService.create (src/data/wedstrijdService.ts) already validates
  -- that formatie belongs to the given formaat (FORMATIE_OPTIONS in
  -- src/data/types.ts: 8v8 -> 1-3-3-1/1-2-3-2, 11v11 -> 1-4-3-3/1-4-4-2), but
  -- that's app-layer only — a direct write bypassing the service (or a
  -- future bug in it) could otherwise still insert a mismatched pair. This
  -- table-level constraint enforces the same pairing rule in the database,
  -- so it holds regardless of what wrote the row.
  constraint wedstrijd_formatie_bij_formaat_check check (
    (formaat = '8v8' and formatie in ('1-3-3-1', '1-2-3-2'))
    or (formaat = '11v11' and formatie in ('1-4-3-3', '1-4-4-2'))
  )
);

comment on table public.wedstrijd is 'Eén wedstrijd: datum, formaat (8v8/11v11) en formatie liggen vast voor de hele wedstrijd. formatie moet bij formaat passen (zie wedstrijd_formatie_bij_formaat_check). tegenstander/scores/thuis_uit volgen uit de latere ticket "Wedstrijdgegevens vastleggen" — kolommen bestaan al, UI nog niet.';

-- Elke leeslijst filtert op seizoen_id, en de RLS-policies hieronder joinen
-- erop; index het.
create index if not exists wedstrijd_seizoen_id_idx on public.wedstrijd (seizoen_id);

alter table public.wedstrijd enable row level security;

-- wedstrijd heeft geen team_id (het hoort bij een seizoen, dat op zijn
-- beurt bij een team hoort), dus de policies hieronder joinen twee niveaus
-- diep: wedstrijd -> seizoen -> team.coach_user_id, in één EXISTS-subquery
-- met een join tussen seizoen en team.

drop policy if exists "Coach kan wedstrijden van eigen team lezen" on public.wedstrijd;
create policy "Coach kan wedstrijden van eigen team lezen"
  on public.wedstrijd
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.seizoen
      join public.team on team.id = seizoen.team_id
      where seizoen.id = wedstrijd.seizoen_id
        and team.coach_user_id = (select auth.uid())
    )
  );

drop policy if exists "Coach kan wedstrijden aan eigen team toevoegen" on public.wedstrijd;
create policy "Coach kan wedstrijden aan eigen team toevoegen"
  on public.wedstrijd
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.seizoen
      join public.team on team.id = seizoen.team_id
      where seizoen.id = wedstrijd.seizoen_id
        and team.coach_user_id = (select auth.uid())
    )
  );

drop policy if exists "Coach kan wedstrijden van eigen team bijwerken" on public.wedstrijd;
create policy "Coach kan wedstrijden van eigen team bijwerken"
  on public.wedstrijd
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.seizoen
      join public.team on team.id = seizoen.team_id
      where seizoen.id = wedstrijd.seizoen_id
        and team.coach_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.seizoen
      join public.team on team.id = seizoen.team_id
      where seizoen.id = wedstrijd.seizoen_id
        and team.coach_user_id = (select auth.uid())
    )
  );

-- Bewust geen "for delete"-policy: geen ticket vraagt om wedstrijden te
-- kunnen verwijderen. Zonder delete-policy staat RLS delete voor
-- 'authenticated' sowieso nergens toe.
