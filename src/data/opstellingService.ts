import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthService } from './authService'

interface OpstellingRow {
  id: string
  speler_id: string
  positie: string
}

/** `{ [positie]: spelerId }` for one (wedstrijd, kwart) — a positie with no
 * entry is an empty slot (see docs/datamodel.md `opstelling`). */
export type OpstellingMap = Record<string, string>

/** One positie's beoordeling (ticket jt-dvh.14.7) — both optional. */
export interface Beoordeling {
  score: number | null
  opmerking: string | null
}

/** `{ [positie]: Beoordeling }` for one (wedstrijd, kwart) — a positie with
 * no rating yet is simply absent (treat as `{ score: null, opmerking: null }`). */
export type BeoordelingMap = Record<string, Beoordeling>

export interface OpstellingService {
  /** Current opstelling for a (wedstrijd, kwart). Rejects with no session. */
  listForKwart(wedstrijdId: string, kwart: number): Promise<OpstellingMap>
  /** Places/moves spelerId into positie for this kwart: moves an existing
   * placement, swaps two occupied positions, or frees the previous
   * occupant back to the wisselbank — derived from one fresh read. */
  placeSpeler(wedstrijdId: string, kwart: number, positie: string, spelerId: string): Promise<void>
  /** Cumulative speeltijd this season so far: number of `opstelling` rows
   * per spelerId, across every wedstrijd in `seizoenId`. A speler with no
   * rows yet is simply absent from the result (treat as 0). */
  cumulatieveSpeeltijdPerSpeler(seizoenId: string): Promise<Record<string, number>>
  /** Beoordelingen for every rated positie in a (wedstrijd, kwart). Kept
   * separate from `listForKwart` so `OpstellingMap` stays a plain
   * spelerId map (see `wisselAlgoritme.ts`, which depends on that shape). */
  listBeoordelingenForKwart(wedstrijdId: string, kwart: number): Promise<BeoordelingMap>
  /** Sets score/opmerking on the existing opstelling-rij for (wedstrijdId,
   * kwart, positie) — reachable only from an already-occupied slot, so that
   * row always exists by the time this is called. Either value may be null. */
  setBeoordeling(wedstrijdId: string, kwart: number, positie: string, score: number | null, opmerking: string | null): Promise<void>
}

export function createOpstellingService(client: SupabaseClient, auth: AuthService): OpstellingService {
  async function updatePositie(id: string, positie: string) {
    const { error } = await client.from('opstelling').update({ positie }).eq('id', id)
    if (error) {
      throw error
    }
  }

  return {
    async listForKwart(wedstrijdId, kwart) {
      const session = await auth.getSession()
      if (!session) {
        throw new Error('Niet ingelogd: kan opstelling niet ophalen.')
      }

      const { data, error } = await client
        .from('opstelling')
        .select('positie, speler_id')
        .eq('wedstrijd_id', wedstrijdId)
        .eq('kwart', kwart)
      if (error) {
        throw error
      }

      const result: OpstellingMap = {}
      for (const row of (data ?? []) as Pick<OpstellingRow, 'positie' | 'speler_id'>[]) {
        result[row.positie] = row.speler_id
      }
      return result
    },

    async placeSpeler(wedstrijdId, kwart, positie, spelerId) {
      const session = await auth.getSession()
      if (!session) {
        throw new Error('Niet ingelogd: kan opstelling niet wijzigen.')
      }

      const { data, error } = await client
        .from('opstelling')
        .select('id, speler_id, positie')
        .eq('wedstrijd_id', wedstrijdId)
        .eq('kwart', kwart)
      if (error) {
        throw error
      }

      const rows = (data ?? []) as OpstellingRow[]
      const spelerRow = rows.find((row) => row.speler_id === spelerId)
      const positieRow = rows.find((row) => row.positie === positie)

      if (spelerRow && positieRow && spelerRow.id === positieRow.id) {
        return
      }

      if (spelerRow && positieRow) {
        // Tijdelijke waarde nodig: anders schendt de tweede update de unique
        // constraint op (wedstrijd_id, kwart, positie) tussentijds.
        const oudePositie = spelerRow.positie
        await updatePositie(positieRow.id, `__swap_${positieRow.id}`)
        await updatePositie(spelerRow.id, positie)
        await updatePositie(positieRow.id, oudePositie)
        return
      }

      if (spelerRow) {
        await updatePositie(spelerRow.id, positie)
        return
      }

      if (positieRow) {
        const { error: moveError } = await client.from('opstelling').update({ speler_id: spelerId }).eq('id', positieRow.id)
        if (moveError) {
          throw moveError
        }
        return
      }

      const { error: insertError } = await client
        .from('opstelling')
        .insert({ wedstrijd_id: wedstrijdId, kwart, speler_id: spelerId, positie })
      if (insertError) {
        throw insertError
      }
    },

    async cumulatieveSpeeltijdPerSpeler(seizoenId) {
      const session = await auth.getSession()
      if (!session) {
        throw new Error('Niet ingelogd: kan speeltijd niet ophalen.')
      }

      const { data: wedstrijden, error: wedstrijdError } = await client
        .from('wedstrijd')
        .select('id')
        .eq('seizoen_id', seizoenId)
      if (wedstrijdError) {
        throw wedstrijdError
      }

      const wedstrijdIds = ((wedstrijden ?? []) as { id: string }[]).map((row) => row.id)
      if (wedstrijdIds.length === 0) {
        return {}
      }

      const { data, error } = await client.from('opstelling').select('speler_id').in('wedstrijd_id', wedstrijdIds)
      if (error) {
        throw error
      }

      const result: Record<string, number> = {}
      for (const row of (data ?? []) as { speler_id: string }[]) {
        result[row.speler_id] = (result[row.speler_id] ?? 0) + 1
      }
      return result
    },

    async listBeoordelingenForKwart(wedstrijdId, kwart) {
      const session = await auth.getSession()
      if (!session) {
        throw new Error('Niet ingelogd: kan beoordeling niet ophalen.')
      }

      const { data, error } = await client
        .from('opstelling')
        .select('positie, score, opmerking')
        .eq('wedstrijd_id', wedstrijdId)
        .eq('kwart', kwart)
      if (error) {
        throw error
      }

      const result: BeoordelingMap = {}
      for (const row of (data ?? []) as { positie: string; score: number | null; opmerking: string | null }[]) {
        result[row.positie] = { score: row.score, opmerking: row.opmerking }
      }
      return result
    },

    async setBeoordeling(wedstrijdId, kwart, positie, score, opmerking) {
      const session = await auth.getSession()
      if (!session) {
        throw new Error('Niet ingelogd: kan beoordeling niet opslaan.')
      }

      const { error } = await client
        .from('opstelling')
        .update({ score, opmerking })
        .eq('wedstrijd_id', wedstrijdId)
        .eq('kwart', kwart)
        .eq('positie', positie)
      if (error) {
        throw error
      }
    },
  }
}
