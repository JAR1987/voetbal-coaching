import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthService } from './authService'
import type { SeizoenService } from './seizoenService'
import type { Formaat, Formatie, ThuisUit, Wedstrijd } from './types'
import { DEFAULT_FORMATIE, FORMATIE_OPTIONS } from './types'

interface WedstrijdRow {
  id: string
  seizoen_id: string
  datum: string
  formaat: Formaat
  formatie: Formatie
  tegenstander: string | null
  eigen_score: number | null
  tegen_score: number | null
  thuis_uit: ThuisUit | null
  kwart_duur_seconden: number
  created_at: string
}

function toWedstrijd(row: WedstrijdRow): Wedstrijd {
  return {
    id: row.id,
    seizoenId: row.seizoen_id,
    datum: row.datum,
    formaat: row.formaat,
    formatie: row.formatie,
    tegenstander: row.tegenstander,
    eigenScore: row.eigen_score,
    tegenScore: row.tegen_score,
    thuisUit: row.thuis_uit,
    kwartDuurSeconden: row.kwart_duur_seconden,
    createdAt: row.created_at,
  }
}

export interface NewWedstrijdInput {
  teamId: string
  /** `YYYY-MM-DD`. Also what resolves/creates the match's season — see `seizoenService.deriveSeasonLabel`. */
  datum: string
  formaat: Formaat
  /** Defaults to that format's default formation (`DEFAULT_FORMATIE`) when omitted; otherwise must be one of that format's two options (`FORMATIE_OPTIONS`). */
  formatie?: Formatie
  /** Optional match-info fields — the UI to fill these in is a later ticket ("Wedstrijdgegevens vastleggen"); default to null. */
  tegenstander?: string | null
  eigenScore?: number | null
  tegenScore?: number | null
  thuisUit?: ThuisUit | null
}

/** The four optional match-info fields, always sent together — the
 * Gegevens form edits them as one unit, fillable at any time after
 * creation (see `WedstrijdService.updateWedstrijdgegevens`). */
export interface WedstrijdgegevensInput {
  tegenstander: string | null
  eigenScore: number | null
  tegenScore: number | null
  thuisUit: ThuisUit | null
}

export interface WedstrijdService {
  /** The given team's matches, most recent first. Rejects if there is no active session. */
  list(teamId: string): Promise<Wedstrijd[]>
  /** Creates a match (`datum`+`formaat` required; `formatie` defaults/validates
   * per format, see `FORMATIE_OPTIONS`). Auto-resolves/creates the season via
   * `seizoenService.getOrCreateSeasonForDate` — there's no season picker in the UI. */
  create(input: NewWedstrijdInput): Promise<Wedstrijd>
  /** Updates this match's default kwart duration (seconds). Rejects if there is no active session. */
  updateKwartDuur(wedstrijdId: string, seconden: number): Promise<Wedstrijd>
  /** Updates the optional match-info fields (tegenstander, thuis/uit,
   * score) — fillable at any time, not just at creation. Rejects if
   * there is no active session. */
  updateWedstrijdgegevens(wedstrijdId: string, gegevens: WedstrijdgegevensInput): Promise<Wedstrijd>
}

/** Reads/writes the `wedstrijd` table. No `team_id` of its own (belongs to a
 * `seizoen`), so `list` scopes via `seizoenService`'s season ids; RLS (see
 * supabase/migrations) independently enforces ownership via that join. */
export function createWedstrijdService(
  client: SupabaseClient,
  auth: AuthService,
  seizoenService: SeizoenService,
): WedstrijdService {
  return {
    async list(teamId) {
      const session = await auth.getSession()
      if (!session) {
        throw new Error('Niet ingelogd: kan geen wedstrijden ophalen.')
      }

      const seizoenen = await seizoenService.list(teamId)
      if (seizoenen.length === 0) {
        return []
      }
      const seizoenIds = seizoenen.map((seizoen) => seizoen.id)

      const { data, error } = await client.from('wedstrijd').select('*').in('seizoen_id', seizoenIds)
      if (error) {
        throw error
      }
      return (data ?? [])
        .map(toWedstrijd)
        .sort((a, b) => b.datum.localeCompare(a.datum) || b.createdAt.localeCompare(a.createdAt))
    },

    async create(input) {
      const session = await auth.getSession()
      if (!session) {
        throw new Error('Niet ingelogd: kan geen wedstrijd aanmaken.')
      }

      const datum = input.datum?.trim()
      if (!datum) {
        throw new Error('Datum is verplicht.')
      }

      const opties = FORMATIE_OPTIONS[input.formaat]
      if (!opties) {
        throw new Error('Ongeldig formaat: kies 8v8 of 11v11.')
      }

      const formatie = input.formatie ?? DEFAULT_FORMATIE[input.formaat]
      if (!opties.includes(formatie)) {
        throw new Error(`Ongeldige formatie voor ${input.formaat}: kies ${opties.join(' of ')}.`)
      }

      // Auto-resolve/create the season before inserting: every match must
      // belong to a season (seizoen_id is not-null), and there's no
      // season-picker in the UI for the coach to do this explicitly.
      const seizoen = await seizoenService.getOrCreateSeasonForDate(input.teamId, datum)

      const { data, error } = await client
        .from('wedstrijd')
        .insert({
          seizoen_id: seizoen.id,
          datum,
          formaat: input.formaat,
          formatie,
          tegenstander: input.tegenstander ?? null,
          eigen_score: input.eigenScore ?? null,
          tegen_score: input.tegenScore ?? null,
          thuis_uit: input.thuisUit ?? null,
        })
        .select()
        .single()
      if (error) {
        throw error
      }
      return toWedstrijd(data)
    },

    async updateKwartDuur(wedstrijdId, seconden) {
      const session = await auth.getSession()
      if (!session) {
        throw new Error('Niet ingelogd: kan kwartduur niet wijzigen.')
      }

      if (!Number.isFinite(seconden) || seconden <= 0) {
        throw new Error('Kwartduur moet een positief aantal seconden zijn.')
      }

      const { data, error } = await client
        .from('wedstrijd')
        .update({ kwart_duur_seconden: Math.round(seconden) })
        .eq('id', wedstrijdId)
        .select()
        .single()
      if (error) {
        throw error
      }
      return toWedstrijd(data)
    },

    async updateWedstrijdgegevens(wedstrijdId, gegevens) {
      const session = await auth.getSession()
      if (!session) {
        throw new Error('Niet ingelogd: kan wedstrijdgegevens niet wijzigen.')
      }

      for (const score of [gegevens.eigenScore, gegevens.tegenScore]) {
        if (score !== null && (!Number.isFinite(score) || score < 0)) {
          throw new Error('Score moet een niet-negatief getal zijn.')
        }
      }

      const { data, error } = await client
        .from('wedstrijd')
        .update({
          tegenstander: gegevens.tegenstander,
          eigen_score: gegevens.eigenScore,
          tegen_score: gegevens.tegenScore,
          thuis_uit: gegevens.thuisUit,
        })
        .eq('id', wedstrijdId)
        .select()
        .single()
      if (error) {
        throw error
      }
      return toWedstrijd(data)
    },
  }
}
