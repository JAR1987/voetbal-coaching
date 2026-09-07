/** A team, as used by the app (camelCase — mapped from the `team` table's snake_case columns). */
export interface Team {
  id: string
  coachUserId: string
  naam: string
  createdAt: string
}
