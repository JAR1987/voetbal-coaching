/** A team, as used by the app (camelCase — mapped from the `team` table's snake_case columns). */
export interface Team {
  id: string
  coachUserId: string
  naam: string
  createdAt: string
}

/** `actief` = on the roster today; `inactief` = stopped, but never deleted (history stays intact). */
export type SpelerStatus = 'actief' | 'inactief'

/** A player, as used by the app (camelCase — mapped from the `speler` table's snake_case columns). */
export interface Speler {
  id: string
  teamId: string
  naam: string
  rugnummer: number | null
  opmerkingen: string | null
  status: SpelerStatus
  createdAt: string
}

/** A season, as used by the app (camelCase — mapped from the `seizoen` table's snake_case columns). */
export interface Seizoen {
  id: string
  teamId: string
  naam: string
  startDatum: string | null
  eindDatum: string | null
  createdAt: string
}

/** Match format: 8-a-side or 11-a-side. */
export type Formaat = '8v8' | '11v11'

/** Formation template. Which two are valid depends on `Formaat` — see `FORMATIE_OPTIONS`. */
export type Formatie = '1-3-3-1' | '1-2-3-2' | '1-4-3-3' | '1-4-4-2'

/** Home or away. */
export type ThuisUit = 'thuis' | 'uit'

/** Display labels for `Formaat`, shared by `WedstrijdScreen` and `MatchDetailScreen`. */
export const FORMAAT_LABELS: Record<Formaat, string> = {
  '8v8': '8-tegen-8',
  '11v11': '11-tegen-11',
}

/**
 * Attendance status for one player at one match — `aanwezig` (present) is
 * the default, `afgemeld` means the coach marked them unavailable. See
 * `src/data/aanwezigheidService.ts` for the "no row = aanwezig" design
 * decision this type is part of.
 */
export type AanwezigheidStatus = 'aanwezig' | 'afgemeld'

/**
 * Fitness status a coach can set per aanwezige player for a match. Only
 * meaningful while `status === 'aanwezig'` — the UI does not offer it for an
 * `afgemeld` player.
 */
export type FitheidStatus = 'fit' | 'let_op' | 'geblesseerd'

/** `FitheidStatus` options in display order, for rendering a select. */
export const FITHEID_OPTIONS: readonly FitheidStatus[] = ['fit', 'let_op', 'geblesseerd']

/** Display labels for `FitheidStatus`. */
export const FITHEID_LABELS: Record<FitheidStatus, string> = {
  fit: 'Fit',
  let_op: 'Let op',
  geblesseerd: 'Geblesseerd',
}

/**
 * The two formation options offered per format (per the ticket: 8v8 gets
 * 1-3-3-1/1-2-3-2, 11v11 gets 1-4-3-3/1-4-4-2), in display order — the first
 * entry of each is the default, see `DEFAULT_FORMATIE`.
 */
export const FORMATIE_OPTIONS: Record<Formaat, readonly Formatie[]> = {
  '8v8': ['1-3-3-1', '1-2-3-2'],
  '11v11': ['1-4-3-3', '1-4-4-2'],
}

/** The preselected formation for each format — the first entry of `FORMATIE_OPTIONS`. */
export const DEFAULT_FORMATIE: Record<Formaat, Formatie> = {
  '8v8': FORMATIE_OPTIONS['8v8'][0],
  '11v11': FORMATIE_OPTIONS['11v11'][0],
}

/** A match, as used by the app (camelCase — mapped from the `wedstrijd` table's snake_case columns). */
export interface Wedstrijd {
  id: string
  seizoenId: string
  /** `YYYY-MM-DD`. */
  datum: string
  formaat: Formaat
  formatie: Formatie
  /** Optional match-info fields — the UI to fill these in is a later ticket ("Wedstrijdgegevens vastleggen"); the columns/plumbing exist already so that ticket needs no new migration. */
  tegenstander: string | null
  eigenScore: number | null
  tegenScore: number | null
  thuisUit: ThuisUit | null
  /** Standaardduur van een kwart in seconden voor deze wedstrijd (default 1200 = 20 min). */
  kwartDuurSeconden: number
  createdAt: string
}

/**
 * A raw `aanwezigheid` row, as used by the app (camelCase — mapped from the
 * table's snake_case columns). One row per (wedstrijd, speler) pair that the
 * coach has actually touched — see `src/data/aanwezigheidService.ts` for why
 * most players never get a row at all ("no row = aanwezig" by default).
 */
export interface Aanwezigheid {
  id: string
  wedstrijdId: string
  spelerId: string
  status: AanwezigheidStatus
  fitheidStatus: FitheidStatus | null
  createdAt: string
}
