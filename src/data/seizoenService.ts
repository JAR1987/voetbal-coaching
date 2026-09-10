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

/** Season label for a date: Aug–Dec → season starting that year, Jan–Jul →
 * season ending that year; regex-parsed (not `new Date()`) to dodge TZ bugs. */
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
  /** Season for a match date (`deriveSeasonLabel`), creating it if needed.
   * Check-then-insert: recovers from a 23505 race via the
   * `seizoen(team_id, naam)` unique constraint (see supabase/migrations). */
  getOrCreateSeasonForDate(teamId: string, datum: string): Promise<Seizoen>
}

/** Reads/writes the `seizoen` table. `team_id` filtering here is a query
 * concern; RLS (see supabase/migrations) independently enforces ownership. */
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
          // Lost the race: someone else already inserted this season between
          // our check and our insert — the real happy path, not an error.
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
