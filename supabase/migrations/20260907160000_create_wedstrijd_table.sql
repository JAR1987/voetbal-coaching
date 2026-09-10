-- Wedstrijd table: één rij per wedstrijd. Formaat en formatie liggen vast
-- voor de hele wedstrijd (docs/datamodel.md — formatie is niet per kwart).
--
-- tegenstander/eigen_score/tegen_score/thuis_uit-kolommen bestaan al, al
-- vult de UI ze pas in een latere ticket ("Wedstrijdgegevens vastleggen").

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
  -- Mirrors wedstrijdService's app-level formatie/formaat validation
  -- (FORMATIE_OPTIONS in src/data/types.ts) at the DB layer, so a bypass or
  -- future service bug can't insert a mismatched pair.
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

-- wedstrijd heeft geen team_id (hoort bij seizoen, dat bij team hoort) —
-- policies joinen twee niveaus diep: wedstrijd -> seizoen -> team.coach_user_id.

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
