import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthService } from '../authService'
import { createStatistiekenService } from '../statistiekenService'

function fakeAuth(session: unknown): AuthService {
  return {
    signIn: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn().mockResolvedValue(session),
    onAuthStateChange: vi.fn(() => () => {}),
  }
}

const authedSession = { user: { id: 'coach-1' } }

/** Fake covering `.from('wedstrijd').select('id').eq(...)`, then
 * `.from('opstelling')...in(...)` and `.from('aanwezigheid')...in(...)`. */
function fakeClient(
  wedstrijdIds: string[],
  opstellingRows: { wedstrijd_id: string; kwart: number; speler_id: string; positie: string; score: number | null }[],
  aanwezigheidRows: { wedstrijd_id: string; speler_id: string; status: string }[],
) {
  const from = vi.fn((table: string) => {
    if (table === 'wedstrijd') {
      return { select: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: wedstrijdIds.map((id) => ({ id })), error: null }) })) }
    }
    if (table === 'opstelling') {
      return { select: vi.fn(() => ({ in: vi.fn().mockResolvedValue({ data: opstellingRows, error: null }) })) }
    }
    return { select: vi.fn(() => ({ in: vi.fn().mockResolvedValue({ data: aanwezigheidRows, error: null }) })) }
  })
  return { client: { from } as unknown as SupabaseClient, from }
}

describe('statistiekenService.berekenVoorSeizoen', () => {
  it('rejects and never queries the database when there is no active session', async () => {
    const { client, from } = fakeClient([], [], [])
    const service = createStatistiekenService(client, fakeAuth(null))

    await expect(service.berekenVoorSeizoen('seizoen-1', ['s1'])).rejects.toThrow(/niet ingelogd/i)
    expect(from).not.toHaveBeenCalled()
  })

  it('returns zeroed stats without querying opstelling/aanwezigheid when the season has no matches yet', async () => {
    const { client, from } = fakeClient([], [], [])
    const service = createStatistiekenService(client, fakeAuth(authedSession))

    const result = await service.berekenVoorSeizoen('seizoen-1', ['s1'])

    expect(from).toHaveBeenCalledWith('wedstrijd')
    expect(from).not.toHaveBeenCalledWith('opstelling')
    expect(from).not.toHaveBeenCalledWith('aanwezigheid')
    expect(result.perSpeler.s1).toEqual({
      spelerId: 's1',
      totaleSpeeltijd: 0,
      wisselCount: 0,
      meestGespeeldePositie: null,
      bestBeoordeeldePositie: null,
      gemiddeldeScorePerPositie: {},
    })
    expect(result.teamOverzicht).toEqual({ gemiddeldeSpeeltijd: 0, regels: [{ spelerId: 's1', totaleSpeeltijd: 0, verschilTovGemiddelde: 0, wisselCount: 0 }] })
  })

  it('combines wedstrijd/opstelling/aanwezigheid rows into per-speler and team-wide statistics', async () => {
    const { client } = fakeClient(
      ['w1'],
      [
        { wedstrijd_id: 'w1', kwart: 1, speler_id: 's1', positie: 'Keeper', score: 4 },
        { wedstrijd_id: 'w1', kwart: 2, speler_id: 's1', positie: 'Keeper', score: 5 },
      ],
      [{ wedstrijd_id: 'w1', speler_id: 's2', status: 'afgemeld' }],
    )
    const service = createStatistiekenService(client, fakeAuth(authedSession))

    const result = await service.berekenVoorSeizoen('seizoen-1', ['s1', 's2'])

    expect(result.perSpeler.s1).toEqual({
      spelerId: 's1',
      totaleSpeeltijd: 2,
      wisselCount: 2, // aanwezig, geplaatst in kwart 1-2, wissel in kwart 3-4
      meestGespeeldePositie: 'Keeper',
      bestBeoordeeldePositie: 'Keeper',
      gemiddeldeScorePerPositie: { Keeper: 4.5 },
    })
    expect(result.perSpeler.s2.wisselCount).toBe(0) // afgemeld: telt niet als wissel
    expect(result.teamOverzicht.gemiddeldeSpeeltijd).toBe(1)
  })

  it('surfaces a Postgres/RLS error from the wedstrijd query', async () => {
    const from = vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: null, error: new Error('permission denied for table wedstrijd') }) })),
    }))
    const client = { from } as unknown as SupabaseClient
    const service = createStatistiekenService(client, fakeAuth(authedSession))

    await expect(service.berekenVoorSeizoen('seizoen-1', ['s1'])).rejects.toThrow(/permission denied/)
  })

  it('surfaces a Postgres/RLS error from the opstelling query', async () => {
    const from = vi.fn((table: string) => {
      if (table === 'wedstrijd') {
        return { select: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: [{ id: 'w1' }], error: null }) })) }
      }
      return { select: vi.fn(() => ({ in: vi.fn().mockResolvedValue({ data: null, error: new Error('permission denied for table opstelling') }) })) }
    })
    const client = { from } as unknown as SupabaseClient
    const service = createStatistiekenService(client, fakeAuth(authedSession))

    await expect(service.berekenVoorSeizoen('seizoen-1', ['s1'])).rejects.toThrow(/permission denied/)
  })

  it('surfaces a Postgres/RLS error from the aanwezigheid query', async () => {
    const from = vi.fn((table: string) => {
      if (table === 'wedstrijd') {
        return { select: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: [{ id: 'w1' }], error: null }) })) }
      }
      if (table === 'opstelling') {
        return { select: vi.fn(() => ({ in: vi.fn().mockResolvedValue({ data: [], error: null }) })) }
      }
      return { select: vi.fn(() => ({ in: vi.fn().mockResolvedValue({ data: null, error: new Error('permission denied for table aanwezigheid') }) })) }
    })
    const client = { from } as unknown as SupabaseClient
    const service = createStatistiekenService(client, fakeAuth(authedSession))

    await expect(service.berekenVoorSeizoen('seizoen-1', ['s1'])).rejects.toThrow(/permission denied/)
  })
})
