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

/**
 * One active player's attendance/fitness for a specific match, after
 * applying the "no row = aanwezig" default (see the module doc comment on
 * `createAanwezigheidService` below). This is what `listForMatch` returns:
 * always exactly one entry per player passed in, carrying the full `Speler`
 * so the UI doesn't need to zip the result back up with a separate player
 * list.
 */
export interface SpelerAanwezigheid {
  speler: Speler
  status: AanwezigheidStatus
  fitheidStatus: FitheidStatus | null
}

export interface AanwezigheidService {
  /**
   * The full attendance list for a match: exactly one entry per player in
   * `alleActievePlayers`, in the same order, defaulted to
   * `status: 'aanwezig'`/`fitheidStatus: null` for any player that has no
   * `aanwezigheid` row yet for this match. Rejects if there is no active
   * session.
   */
  listForMatch(wedstrijdId: string, alleActievePlayers: Speler[]): Promise<SpelerAanwezigheid[]>
  /**
   * Sets a player's attendance status for a match (upsert on
   * `(wedstrijd_id, speler_id)` — creates the row if it doesn't exist yet,
   * updates it if it does). Only touches the `status` column: an existing
   * `fitheid_status` on that row is left untouched, and a newly-created row
   * gets the column default (`null`, i.e. no fitheid set yet).
   */
  setStatus(wedstrijdId: string, spelerId: string, status: AanwezigheidStatus): Promise<Aanwezigheid>
  /**
   * Sets a player's fitheid status for a match (same upsert target as
   * `setStatus`). Only touches the `fitheid_status` column: an existing
   * `status` on that row is left untouched, and a newly-created row gets the
   * table default (`'aanwezig'`) for `status`. Pass `null` to clear a
   * previously-set fitheid status.
   */
  setFitheid(wedstrijdId: string, spelerId: string, fitheidStatus: FitheidStatus | null): Promise<Aanwezigheid>
}

/**
 * Reads/writes the `aanwezigheid` table.
 *
 * Design decision — "no row means aanwezig": per the ticket ("Standaard
 * iedereen aanwezig"), a coach should never have to do anything for the
 * common case where the whole team is present. Rather than inserting an
 * `aanwezigheid` row for every active player up front, this service treats
 * the *absence* of a row for a (wedstrijd, speler) pair as an implicit
 * "aanwezig, no fitheid set" — a row only gets created (via `setStatus` or
 * `setFitheid`) the moment the coach actually changes something for that
 * player. `listForMatch` is what applies this default: it fetches whatever
 * `aanwezigheid` rows already exist for the match, then merges them onto the
 * full active-roster list the caller passes in, filling in the default for
 * every player that has no row yet.
 *
 * `setStatus`/`setFitheid` both upsert on `(wedstrijd_id, speler_id)` — the
 * unique constraint from `supabase/migrations` — rather than a
 * check-then-insert: this is a natural upsert target (see
 * docs/datamodel.md), not a race-prone read-then-write, so there's no
 * separate "recover from 23505" dance like `teamService.getOrCreateMyTeam`
 * or `seizoenService.getOrCreateSeasonForDate` need for their check-then-
 * insert. Each upsert only names the one column it means to change
 * (`status` or `fitheid_status`), so setting one never clobbers the other on
 * an existing row — Postgres's `ON CONFLICT DO UPDATE SET <named columns>`
 * (which is what supabase-js's `.upsert()` generates) simply leaves
 * unnamed columns alone.
 *
 * `wedstrijd_id`/`speler_id` are filtered client-side — like `speler.team_id`
 * elsewhere, these aren't the RLS-scoping columns, just "which match's
 * attendance do we want". RLS on `aanwezigheid` (see supabase/migrations)
 * independently enforces ownership via a three-level join
 * (aanwezigheid -> wedstrijd -> seizoen -> team.coach_user_id).
 */
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
