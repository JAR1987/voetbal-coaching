import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthService } from './authService'
import type { AanwezigheidStatus } from './types'
import {
  berekenStatistiekenPerSpeler,
  berekenTeamOverzicht,
  type AanwezigheidStatRij,
  type OpstellingStatRij,
  type SpelerStatistieken,
  type TeamOverzicht,
} from './statistiekenAggregatie'

export type { SpelerStatistieken, TeamOverzicht, TeamOverzichtRegel } from './statistiekenAggregatie'

export interface SeizoenStatistieken {
  perSpeler: Record<string, SpelerStatistieken>
  teamOverzicht: TeamOverzicht
}

export interface StatistiekenService {
  /** Full statistics for `seizoenId`: per-speler profile plus the team-wide
   * speeltijd-eerlijkheid overzicht, across every wedstrijd in that season.
   * `spelerIds` (typically the active roster) drives which spelers get an entry. */
  berekenVoorSeizoen(seizoenId: string, spelerIds: readonly string[]): Promise<SeizoenStatistieken>
}

/** Reads `wedstrijd`/`opstelling`/`aanwezigheid` for one season and delegates
 * the actual aggregation to `statistiekenAggregatie` (kept pure/IO-free so it
 * can be unit-tested directly — see its own test file). */
export function createStatistiekenService(client: SupabaseClient, auth: AuthService): StatistiekenService {
  return {
    async berekenVoorSeizoen(seizoenId, spelerIds) {
      const session = await auth.getSession()
      if (!session) {
        throw new Error('Niet ingelogd: kan geen statistieken ophalen.')
      }

      const { data: wedstrijden, error: wedstrijdError } = await client
        .from('wedstrijd')
        .select('id')
        .eq('seizoen_id', seizoenId)
      if (wedstrijdError) {
        throw wedstrijdError
      }
      const wedstrijdIds = ((wedstrijden ?? []) as { id: string }[]).map((row) => row.id)

      let opstellingRijen: OpstellingStatRij[] = []
      let aanwezigheidRijen: AanwezigheidStatRij[] = []

      if (wedstrijdIds.length > 0) {
        const { data: opstellingData, error: opstellingError } = await client
          .from('opstelling')
          .select('wedstrijd_id, kwart, speler_id, positie, score')
          .in('wedstrijd_id', wedstrijdIds)
        if (opstellingError) {
          throw opstellingError
        }
        const opstellingRows = (opstellingData ?? []) as {
          wedstrijd_id: string
          kwart: number
          speler_id: string
          positie: string
          score: number | null
        }[]
        opstellingRijen = opstellingRows.map((row) => ({
          wedstrijdId: row.wedstrijd_id,
          kwart: row.kwart,
          spelerId: row.speler_id,
          positie: row.positie,
          score: row.score,
        }))

        const { data: aanwezigheidData, error: aanwezigheidError } = await client
          .from('aanwezigheid')
          .select('wedstrijd_id, speler_id, status')
          .in('wedstrijd_id', wedstrijdIds)
        if (aanwezigheidError) {
          throw aanwezigheidError
        }
        const aanwezigheidRows = (aanwezigheidData ?? []) as {
          wedstrijd_id: string
          speler_id: string
          status: AanwezigheidStatus
        }[]
        aanwezigheidRijen = aanwezigheidRows.map((row) => ({
          wedstrijdId: row.wedstrijd_id,
          spelerId: row.speler_id,
          status: row.status,
        }))
      }

      const perSpeler = berekenStatistiekenPerSpeler(spelerIds, opstellingRijen, aanwezigheidRijen, wedstrijdIds)
      const teamOverzicht = berekenTeamOverzicht(perSpeler, spelerIds)
      return { perSpeler, teamOverzicht }
    },
  }
}
