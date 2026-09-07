-- Unieke constraint op team.coach_user_id.
--
-- teamService.getOrCreateMyTeam() (src/data/teamService.ts) doet een
-- check-then-insert: kijkt of de coach al een team heeft, en maakt er
-- anders één aan. Zonder een DB-constraint kunnen twee gelijktijdige
-- aanroepen voor dezelfde coach (React StrictMode's dubbele
-- effect-aanroep in dev, twee open tabbladen bij de allereerste login, ...)
-- allebei "nog geen team" zien en allebei een team invoegen — dat levert
-- stilletjes twee team-rijen voor één coach op, waarna getMyTeams()[0]
-- willekeurig één van de twee kiest.
--
-- Deze constraint maakt de tweede insert een unique-violation (Postgres
-- 23505) in plaats van een stille dubbele rij; getOrCreateMyTeam vangt die
-- violation af en leest het net aangemaakte team van de ander terug, in
-- plaats van de violation als fout door te geven.
--
-- Single-team-per-coach is vandaag de dag een bewuste aanname (zie
-- docs/datamodel.md, en de ticket-instructies voor "Spelerslijst beheren").
-- Mocht dat later veranderen (een coach met meerdere teams), dan is deze
-- constraint in een latere migratie gewoon weer te verwijderen.

alter table public.team
  add constraint team_coach_user_id_key unique (coach_user_id);
