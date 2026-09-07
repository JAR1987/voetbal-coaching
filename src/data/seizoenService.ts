import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthService } from './authService'
import type { Seizoen } from './types'

interface SeizoenRow {
  id: string
  team_id: string
  naam: string
  start_datum: string | null
  eind_datum: string | null
  created_at: string
}

function toSeizoen(row: SeizoenRow): Seizoen {
  return {
    id: row.id,
    teamId: row.team_id,
    naam: row.naam,
    startDatum: row.start_datum,
    eindDatum: row.eind_datum,
    createdAt: row.created_at,
  }
}

/** Postgres unique_violation (23505) — how Supabase/PostgREST reports a duplicate key. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505'
}

/**
 * Derives the season label (`seizoen.naam`, e.g. "2025-2026") that a given
 * match date falls into.
 *
 * This is a real design decision, not derived from any external source, so
 * it's spelled out here rather than left implicit: European youth-football
 * seasons run August through May. A date in August–December belongs to the
 * season that *starts* that calendar year (e.g. a match on 2026-09-07 falls
 * in "2026-2027"); a date in January–July belongs to the season that *ends*
 * that calendar year (e.g. a match on 2026-03-14 falls in "2025-2026").
 *
 * Takes the plain `YYYY-MM-DD` string a Postgres `date` column round-trips
 * as (also what an `<input type="date">` produces) and parses it directly
 * with a regex, rather than going through `new Date(...)`/`getMonth()` —
 * that sidesteps any timezone-driven off-by-one-day surprises around local
 * midnight, which a naive `Date` parse of a date-only string is prone to.
 */
export function deriveSeasonLabel(datum: string): string {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(datum)
  if (!match) {
    throw new Error(`Ongeldige datum: "${datum}" (verwacht YYYY-MM-DD).`)
  }
  const year = Number(match[1])
  const month = Number(match[2])
  return month >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`
}

export interface SeizoenService {
  /** All of the given team's seasons. Rejects if there is no active session. */
  list(teamId: string): Promise<Seizoen[]>
  /**
   * The season that the given match date falls into for this team (see
   * `deriveSeasonLabel`), creating it if it doesn't exist yet. Rejects if
   * there is no active session.
   *
   * This is a check-then-insert, so two concurrent calls for the same
   * team+season (two matches created back-to-back, React StrictMode's
   * double effect invocation in dev, ...) can both see "no such season yet".
   * The unique constraint on `seizoen (team_id, naam)` (see
   * supabase/migrations — added in the very same migration that creates the
   * table, unlike `team.coach_user_id`'s constraint in ticket 2, which
   * landed as a follow-up after the race was found) stops that from
   * creating two rows: the loser's insert comes back as a 23505
   * unique-violation, which this method treats as "someone else just
   * created it" and recovers from by re-reading the now-existing row,
   * rather than surfacing it as an error. Same pattern as
   * `teamService.getOrCreateMyTeam`.
   */
  getOrCreateSeasonForDate(teamId: string, datum: string): Promise<Seizoen>
}

/**
 * Reads/writes the `seizoen` table.
 *
 * `team_id` is filtered client-side (`.eq('team_id', teamId)`) — like
 * `speler.team_id`, this isn't the RLS-scoping column, it's just "which
 * team's seasons do we want". RLS on `seizoen` (see supabase/migrations)
 * still independently enforces that the row's team belongs to the
 * signed-in coach via a join back to `team`.
 */
export function createSeizoenService(client: SupabaseClient, auth: AuthService): SeizoenService {
  async function findByNaam(teamId: string, naam: string): Promise<Seizoen[]> {
    const { data, error } = await client.from('seizoen').select('*').eq('team_id', teamId).eq('naam', naam)
    if (error) {
      throw error
    }
    return (data ?? []).map(toSeizoen)
  }

  return {
    async list(teamId) {
      const session = await auth.getSession()
      if (!session) {
        throw new Error('Niet ingelogd: kan geen seizoenen ophalen.')
      }

      const { data, error } = await client.from('seizoen').select('*').eq('team_id', teamId)
      if (error) {
        throw error
      }
      return (data ?? []).map(toSeizoen)
    },

    async getOrCreateSeasonForDate(teamId, datum) {
      const session = await auth.getSession()
      if (!session) {
        throw new Error('Niet ingelogd: kan geen seizoen ophalen of aanmaken.')
      }

      const naam = deriveSeasonLabel(datum)

      const existing = await findByNaam(teamId, naam)
      if (existing.length > 0) {
        return existing[0]
      }

      const { data, error } = await client.from('seizoen').insert({ team_id: teamId, naam }).select().single()
      if (error) {
        if (isUniqueViolation(error)) {
          // Lost the race: another concurrent call already inserted this
          // team's season for this naam between our check and our insert.
          // That row is the real happy path here, not this error — go get
          // it.
          const afterRace = await findByNaam(teamId, naam)
          if (afterRace.length > 0) {
            return afterRace[0]
          }
        }
        throw error
      }
      return toSeizoen(data)
    },
  }
}
