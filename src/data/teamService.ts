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
  /** The coach's team, creating one if needed (single-team-per-coach for now,
   * docs/datamodel.md). Check-then-insert: recovers from a 23505 race via
   * `team.coach_user_id`'s unique constraint (see supabase/migrations). */
  getOrCreateMyTeam(): Promise<Team>
}

/** Reads the coach's team(s). No client-side `coach_user_id` filter: RLS on
 * `team` (see supabase/migrations) is what scopes rows to `auth.uid()`. */
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
