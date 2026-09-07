import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthService } from './authService'
import type { Team } from './types'

interface TeamRow {
  id: string
  coach_user_id: string
  naam: string
  created_at: string
}

function toTeam(row: TeamRow): Team {
  return {
    id: row.id,
    coachUserId: row.coach_user_id,
    naam: row.naam,
    createdAt: row.created_at,
  }
}

/** Postgres unique_violation (23505) — how Supabase/PostgREST reports a duplicate key. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505'
}

export interface TeamService {
  /** The signed-in coach's own team(s). Rejects if there is no active session. */
  getMyTeams(): Promise<Team[]>
  /**
   * The coach's team, creating one if they don't have one yet.
   *
   * Single-team-per-coach for now (per docs/datamodel.md): if `getMyTeams`
   * already returns a row, that row is returned as-is; otherwise a new team
   * is inserted for the signed-in coach. Rejects if there is no active
   * session.
   *
   * This is a check-then-insert, so two concurrent calls for the same coach
   * (React StrictMode's double effect invocation in dev, two tabs on first
   * login, ...) can both see "no team yet". The unique constraint on
   * `team.coach_user_id` (see supabase/migrations) stops that from creating
   * two rows: the loser's insert comes back as a 23505 unique-violation,
   * which this method treats as "someone else just created it" and recovers
   * from by re-reading the now-existing row, rather than surfacing it as an
   * error.
   */
  getOrCreateMyTeam(): Promise<Team>
}

/**
 * Reads the coach's team(s) from the `team` table.
 *
 * Deliberately does NOT add a `.eq('coach_user_id', ...)` filter to the
 * query below — Postgres Row-Level Security on `team` (see
 * supabase/migrations) is what scopes rows to `auth.uid()`. Adding a
 * client-side filter here would just duplicate that and could mask a broken
 * RLS policy instead of surfacing it, so this stays a plain `select *` and
 * trusts the database to only return rows the caller is allowed to see.
 *
 * Also refuses to even make the request when there's no session, rather
 * than firing an unauthenticated call that RLS would reject anyway.
 */
export function createTeamService(client: SupabaseClient, auth: AuthService): TeamService {
  async function getMyTeams(): Promise<Team[]> {
    const session = await auth.getSession()
    if (!session) {
      throw new Error('Niet ingelogd: kan geen teams ophalen.')
    }

    const { data, error } = await client.from('team').select('*')
    if (error) {
      throw error
    }
    return (data ?? []).map(toTeam)
  }

  return {
    getMyTeams,

    async getOrCreateMyTeam() {
      const session = await auth.getSession()
      if (!session) {
        throw new Error('Niet ingelogd: kan geen team ophalen of aanmaken.')
      }

      const existing = await getMyTeams()
      if (existing.length > 0) {
        return existing[0]
      }

      const { data, error } = await client
        .from('team')
        .insert({ coach_user_id: session.user.id, naam: 'Mijn team' })
        .select()
        .single()
      if (error) {
        if (isUniqueViolation(error)) {
          // Lost the race: another concurrent call already inserted this
          // coach's team between our check and our insert. That row is the
          // real happy path here, not this error — go get it.
          const afterRace = await getMyTeams()
          if (afterRace.length > 0) {
            return afterRace[0]
          }
        }
        throw error
      }
      return toTeam(data)
    },
  }
}
