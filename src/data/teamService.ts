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

export interface TeamService {
  /** The signed-in coach's own team(s). Rejects if there is no active session. */
  getMyTeams(): Promise<Team[]>
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
  return {
    async getMyTeams() {
      const session = await auth.getSession()
      if (!session) {
        throw new Error('Niet ingelogd: kan geen teams ophalen.')
      }

      const { data, error } = await client.from('team').select('*')
      if (error) {
        throw error
      }
      return (data ?? []).map(toTeam)
    },
  }
}
