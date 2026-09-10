import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthService } from './authService'
import type { Speler, SpelerStatus } from './types'

interface SpelerRow {
  id: string
  team_id: string
  naam: string
  rugnummer: number | null
  opmerkingen: string | null
  status: SpelerStatus
  created_at: string
}

function toSpeler(row: SpelerRow): Speler {
  return {
    id: row.id,
    teamId: row.team_id,
    naam: row.naam,
    rugnummer: row.rugnummer,
    opmerkingen: row.opmerkingen,
    status: row.status,
    createdAt: row.created_at,
  }
}

export interface NewSpelerInput {
  teamId: string
  naam: string
  rugnummer?: number | null
  opmerkingen?: string | null
}

export interface SpelerUpdateInput {
  naam?: string
  rugnummer?: number | null
  opmerkingen?: string | null
}

export interface ListSpelersOptions {
  /** When true, also returns `inactief` players. Defaults to active-only. */
  includeInactive?: boolean
}

export interface SpelerService {
  /** The given team's players. Active-only by default; pass `includeInactive` to also see deactivated players. Rejects if there is no active session. */
  list(teamId: string, options?: ListSpelersOptions): Promise<Speler[]>
  /** Adds a new player to a team. `naam` is required; `rugnummer`/`opmerkingen` are optional. */
  create(input: NewSpelerInput): Promise<Speler>
  /** Updates one or more fields of an existing player, by id. */
  update(id: string, changes: SpelerUpdateInput): Promise<Speler>
  /** Sets a player's status (`actief`/`inactief`), by id. Never deletes the row (docs/datamodel.md). */
  setStatus(id: string, status: SpelerStatus): Promise<Speler>
}

/** Reads/writes the `speler` table. `team_id` filtering here is a query
 * concern; RLS (see supabase/migrations) independently enforces ownership. */
export function createSpelerService(client: SupabaseClient, auth: AuthService): SpelerService {
  return {
    async list(teamId, options = {}) {
      const session = await auth.getSession()
      if (!session) {
        throw new Error('Niet ingelogd: kan geen spelers ophalen.')
      }

      const statuses: SpelerStatus[] = options.includeInactive ? ['actief', 'inactief'] : ['actief']
      const { data, error } = await client
        .from('speler')
        .select('*')
        .eq('team_id', teamId)
        .in('status', statuses)
      if (error) {
        throw error
      }
      return (data ?? []).map(toSpeler).sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))
    },

    async create(input) {
      const session = await auth.getSession()
      if (!session) {
        throw new Error('Niet ingelogd: kan geen speler toevoegen.')
      }

      const naam = input.naam.trim()
      if (!naam) {
        throw new Error('Naam is verplicht.')
      }

      const { data, error } = await client
        .from('speler')
        .insert({
          team_id: input.teamId,
          naam,
          rugnummer: input.rugnummer ?? null,
          opmerkingen: input.opmerkingen ?? null,
        })
        .select()
        .single()
      if (error) {
        throw error
      }
      return toSpeler(data)
    },

    async update(id, changes) {
      const session = await auth.getSession()
      if (!session) {
        throw new Error('Niet ingelogd: kan speler niet bijwerken.')
      }

      const patch: Record<string, unknown> = {}
      if (changes.naam !== undefined) {
        const naam = changes.naam.trim()
        if (!naam) {
          throw new Error('Naam is verplicht.')
        }
        patch.naam = naam
      }
      if (changes.rugnummer !== undefined) {
        patch.rugnummer = changes.rugnummer
      }
      if (changes.opmerkingen !== undefined) {
        patch.opmerkingen = changes.opmerkingen
      }

      const { data, error } = await client.from('speler').update(patch).eq('id', id).select().single()
      if (error) {
        throw error
      }
      return toSpeler(data)
    },

    async setStatus(id, status) {
      const session = await auth.getSession()
      if (!session) {
        throw new Error('Niet ingelogd: kan spelerstatus niet wijzigen.')
      }

      const { data, error } = await client
        .from('speler')
        .update({ status })
        .eq('id', id)
        .select()
        .single()
      if (error) {
        throw error
      }
      return toSpeler(data)
    },
  }
}
