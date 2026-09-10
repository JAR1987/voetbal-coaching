# Datamodel — Opstelling Coach

Beslissing voor ticket [Datamodel (Supabase/Postgres)](jt-dvh.10). Beschrijft de entiteiten/tabellen en relaties in Supabase/Postgres. Dit is een ontwerpbeslissing, geen migratiebestand — de daadwerkelijke SQL-migraties horen in de bouwfase.

## Uitgangspunten (uit eerdere beslissingen)

- Single-user nu: elk `team` heeft precies één coach (`coach_user_id`), maar de kolom bestaat al zodat een tweede coach/team later gewoon een tweede rij is — geen herbouw nodig.
- Formatie ligt vast voor de hele wedstrijd (niet per kwart).
- Score is 1-5 sterren, optioneel, per (wedstrijd, kwart, speler).
- Spelers die stoppen worden op `inactief` gezet, nooit verwijderd (historie blijft bewaard).
- Aanwezigheid wordt apart per wedstrijd geregistreerd; een "wissel" in een kwart is een speler die aanwezig is maar in dat kwart geen `opstelling`-rij heeft.

## Tabellen

### `team`
| kolom | type | omschrijving |
|---|---|---|
| id | uuid, pk | |
| coach_user_id | uuid, fk → auth.users | eigenaar; RLS-scoping |
| naam | text | bv. "JO11-1" |
| created_at | timestamptz | |

### `seizoen`
| kolom | type | omschrijving |
|---|---|---|
| id | uuid, pk | |
| team_id | uuid, fk → team | |
| naam | text | bv. "2025-2026" |
| start_datum | date, null | |
| eind_datum | date, null | |
| created_at | timestamptz | |

### `speler`
| kolom | type | omschrijving |
|---|---|---|
| id | uuid, pk | |
| team_id | uuid, fk → team | speler hoort bij het team, niet bij één seizoen |
| naam | text | |
| rugnummer | int, null | |
| opmerkingen | text, null | vrij opmerkingenveld, los van wedstrijd/positie |
| status | text | `actief` / `inactief`, default `actief` |
| created_at | timestamptz | |

### `wedstrijd`
| kolom | type | omschrijving |
|---|---|---|
| id | uuid, pk | |
| seizoen_id | uuid, fk → seizoen | |
| datum | date | |
| formaat | text | `8v8` / `11v11` |
| formatie | text | bv. `1-3-3-1`; geldt voor de hele wedstrijd |
| tegenstander | text, null | verfijning volgt uit ticket "Wedstrijdgegevens vastleggen" |
| eigen_score | int, null | idem |
| tegen_score | int, null | idem |
| thuis_uit | text, null | `thuis` / `uit`, idem |
| created_at | timestamptz | |

### `aanwezigheid`
| kolom | type | omschrijving |
|---|---|---|
| id | uuid, pk | |
| wedstrijd_id | uuid, fk → wedstrijd | |
| speler_id | uuid, fk → speler | |
| status | text | `aanwezig` / `afgemeld` |
| fitheid_status | text, null | verfijning volgt uit ticket "Fitheid/blessure-status ontwerp" |
| unique | (wedstrijd_id, speler_id) | een speler heeft één aanwezigheidsstatus per wedstrijd |

### `opstelling`
Eén rij per (wedstrijd, kwart, speler) zodra die speler dat kwart een positie krijgt. Bevat meteen de beoordeling voor dat kwart/die positie (geen aparte tabel nodig).

| kolom | type | omschrijving |
|---|---|---|
| id | uuid, pk | |
| wedstrijd_id | uuid, fk → wedstrijd | |
| kwart | int | 1 t/m 4 |
| speler_id | uuid, fk → speler | |
| positie | text | bv. `keeper`, `linksback` — moet passen bij `wedstrijd.formatie` |
| score | int, null | 1-5 sterren, optioneel |
| opmerking | text, null | vrije tekst over deze positie/dit kwart |
| created_at | timestamptz | |
| unique | (wedstrijd_id, kwart, speler_id) | een speler heeft hooguit één positie per kwart |
| unique | (wedstrijd_id, kwart, positie) | een positie heeft hooguit één speler per kwart |

**Wissel/wisselbank** wordt niet apart opgeslagen: een speler telt voor een kwart als "wissel" wanneer die in `aanwezigheid` op `aanwezig` staat voor die wedstrijd, maar geen `opstelling`-rij heeft voor dat specifieke kwart. "Hoe vaak als wissel gestaan" = aantal (wedstrijd, kwart)-combinaties waarin de speler aanwezig was zonder opstelling-rij.

**Favoriete positie** volgt rechtstreeks uit `opstelling`: "meest gespeeld" = positie met de meeste rijen per speler; "best beoordeeld" = positie met het hoogste gemiddelde `score` per speler (alleen rijen met een ingevulde score meegeteld).

## Relaties (overzicht)

```
team 1──* seizoen 1──* wedstrijd 1──* opstelling *──1 speler
  │                         │
  └──* speler                └──* aanwezigheid *──1 speler
```

## RLS (Row-Level Security)

Elke tabel wordt gescoped op de coach via `team.coach_user_id = auth.uid()`, met de onderliggende tabellen (seizoen, speler, wedstrijd, aanwezigheid, opstelling) gefilterd via een join/EXISTS-check terug naar hun `team`. Concrete policies zijn bouwwerk, niet onderdeel van deze beslissing.

## Open verfijningen (volgen uit nog openstaande tickets)

- Exacte kolommen/waarden voor `wedstrijd.tegenstander`/scores (ticket "Wedstrijdgegevens vastleggen").
- Exacte waarden voor `aanwezigheid.fitheid_status` (ticket "Fitheid/blessure-status ontwerp").
