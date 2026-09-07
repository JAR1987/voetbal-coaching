/** A team, as used by the app (camelCase — mapped from the `team` table's snake_case columns). */
export interface Team {
  id: string
  coachUserId: string
  naam: string
  createdAt: string
}

/** `actief` = on the roster today; `inactief` = stopped, but never deleted (history stays intact). */
export type SpelerStatus = 'actief' | 'inactief'

/** A player, as used by the app (camelCase — mapped from the `speler` table's snake_case columns). */
export interface Speler {
  id: string
  teamId: string
  naam: string
  rugnummer: number | null
  opmerkingen: string | null
  status: SpelerStatus
  createdAt: string
}
