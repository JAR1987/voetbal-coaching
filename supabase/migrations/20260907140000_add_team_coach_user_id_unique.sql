-- Race-guard for teamService.getOrCreateMyTeam's check-then-insert (see the 23505 recovery there).

alter table public.team
  add constraint team_coach_user_id_key
  unique (coach_user_id);
