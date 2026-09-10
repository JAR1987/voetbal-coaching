import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthService } from './authService'
import type { Aanwezigheid, AanwezigheidStatus, FitheidStatus, Speler } from './types'

interface AanwezigheidRow {
  id: string
  wedstrijd_id: string
  speler_id: string
  status: AanwezigheidStatus
  fitheid_status: FitheidStatus | null
  created_at: string
}

function toAanwezigheid(row: AanwezigheidRow): Aanwezigheid {
  return {
    id: row.id,
    wedstrijdId: row.wedstrijd_id,
    spelerId: row.speler_id,
    status: row.status,
    fitheidStatus: row.fitheid_status,
    createdAt: row.created_at,
  }
}

/** One player's attendance/fitness for a match (the "no row = aanwezig"
 * default already applied) — what `listForMatch` returns, one per player. */
export interface SpelerAanwezigheid {
  speler: Speler
  status: AanwezigheidStatus
  fitheidStatus: FitheidStatus | null
}

export interface AanwezigheidService {
  /** Full attendance list: one entry per player in `alleActievePlayers`, same
   * order, defaulted to `aanwezig`/no-fitheid when there's no row yet. */
  listForMatch(wedstrijdId: string, alleActievePlayers: Speler[]): Promise<SpelerAanwezigheid[]>
  /** Upserts a player's attendance status on `(wedstrijd_id, speler_id)`.
   * Only touches `status` — an existing `fitheid_status` is left untouched. */
  setStatus(wedstrijdId: string, spelerId: string, status: AanwezigheidStatus): Promise<Aanwezigheid>
  /** Upserts a player's fitheid status (same target as `setStatus`). Only
   * touches `fitheid_status`; pass `null` to clear it. */
  setFitheid(wedstrijdId: string, spelerId: string, fitheidStatus: FitheidStatus | null): Promise<Aanwezigheid>
}

/** Reads/writes the `aanwezigheid` table. "No row" means `aanwezig` (see
 * `SpelerAanwezigheid`); setStatus/setFitheid upsert on the
 * `(wedstrijd_id, speler_id)` constraint (see supabase/migrations). */
export function createAanwezigheidService(client: SupabaseClient, auth: AuthService): AanwezigheidService {
  return {
    async listForMatch(wedstrijdId, alleActievePlayers) {
      const session = await auth.getSession()
      if (!session) {
        throw new Error('Niet ingelogd: kan geen aanwezigheid ophalen.')
      }

      const { data, error } = await client.from('aanwezigheid').select('*').eq('wedstrijd_id', wedstrijdId)
      if (error) {
        throw error
      }

      const bestaandePerSpeler = new Map<string, AanwezigheidRow>()
      for (const row of (data ?? []) as AanwezigheidRow[]) {
        bestaandePerSpeler.set(row.speler_id, row)
      }

      return alleActievePlayers.map((speler) => {
        const bestaande = bestaandePerSpeler.get(speler.id)
        return {
          speler,
          status: bestaande?.status ?? 'aanwezig',
          fitheidStatus: bestaande?.fitheid_status ?? null,
        }
      })
    },

    async setStatus(wedstrijdId, spelerId, status) {
      const session = await auth.getSession()
      if (!session) {
        throw new Error('Niet ingelogd: kan aanwezigheid niet wijzigen.')
      }

      const { data, error } = await client
        .from('aanwezigheid')
        .upsert(
          { wedstrijd_id: wedstrijdId, speler_id: spelerId, status },
          { onConflict: 'wedstrijd_id,speler_id' },
        )
        .select()
        .single()
      if (error) {
        throw error
      }
      return toAanwezigheid(data)
    },

    async setFitheid(wedstrijdId, spelerId, fitheidStatus) {
      const session = await auth.getSession()
      if (!session) {
        throw new Error('Niet ingelogd: kan fitheid niet wijzigen.')
      }

      const { data, error } = await client
        .from('aanwezigheid')
        .upsert(
          { wedstrijd_id: wedstrijdId, speler_id: spelerId, fitheid_status: fitheidStatus },
          { onConflict: 'wedstrijd_id,speler_id' },
        )
        .select()
        .single()
      if (error) {
        throw error
      }
      return toAanwezigheid(data)
    },
  }
}
