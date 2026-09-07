import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthService } from '../authService'
import { createSeizoenService, deriveSeasonLabel } from '../seizoenService'

function fakeAuth(session: unknown): AuthService {
  return {
    signIn: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn().mockResolvedValue(session),
    onAuthStateChange: vi.fn(() => () => {}),
  }
}

const authedSession = { user: { id: 'coach-1' } }

describe('deriveSeasonLabel', () => {
  it('assigns an August-through-December date to the season starting that calendar year', () => {
    expect(deriveSeasonLabel('2026-09-07')).toBe('2026-2027')
    expect(deriveSeasonLabel('2026-08-01')).toBe('2026-2027')
    expect(deriveSeasonLabel('2026-12-31')).toBe('2026-2027')
  })

  it('assigns a January-through-July date to the season ending that calendar year', () => {
    expect(deriveSeasonLabel('2026-03-14')).toBe('2025-2026')
    expect(deriveSeasonLabel('2026-01-01')).toBe('2025-2026')
    expect(deriveSeasonLabel('2026-07-31')).toBe('2025-2026')
  })

  it('rejects a malformed date instead of guessing', () => {
    expect(() => deriveSeasonLabel('not-a-date')).toThrow(/ongeldige datum/i)
    expect(() => deriveSeasonLabel('2026-9-7')).toThrow(/ongeldige datum/i)
  })
})

describe('seizoenService.list', () => {
  it('rejects and never queries the database when there is no active session', async () => {
    const from = vi.fn()
    const client = { from } as unknown as SupabaseClient
    const service = createSeizoenService(client, fakeAuth(null))

    await expect(service.list('team-1')).rejects.toThrow(/niet ingelogd/i)
    expect(from).not.toHaveBeenCalled()
  })

  it("returns the team's seasons, scoped by team_id", async () => {
    const eq = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'sz1',
          team_id: 'team-1',
          naam: '2025-2026',
          start_datum: null,
          eind_datum: null,
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      error: null,
    })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })
    const client = { from } as unknown as SupabaseClient
    const service = createSeizoenService(client, fakeAuth(authedSession))

    const seasons = await service.list('team-1')

    expect(from).toHaveBeenCalledWith('seizoen')
    expect(eq).toHaveBeenCalledWith('team_id', 'team-1')
    expect(seasons).toEqual([
      { id: 'sz1', teamId: 'team-1', naam: '2025-2026', startDatum: null, eindDatum: null, createdAt: '2026-01-01T00:00:00Z' },
    ])
  })

  it('surfaces a Postgres/RLS error instead of silently returning seasons', async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: new Error('permission denied for table seizoen') })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })
    const client = { from } as unknown as SupabaseClient
    const service = createSeizoenService(client, fakeAuth(authedSession))

    await expect(service.list('team-1')).rejects.toThrow(/permission denied/)
  })
})

describe('seizoenService.getOrCreateSeasonForDate', () => {
  it('rejects and never queries the database when there is no active session', async () => {
    const from = vi.fn()
    const client = { from } as unknown as SupabaseClient
    const service = createSeizoenService(client, fakeAuth(null))

    await expect(service.getOrCreateSeasonForDate('team-1', '2026-09-07')).rejects.toThrow(/niet ingelogd/i)
    expect(from).not.toHaveBeenCalled()
  })

  it('returns the existing season without inserting when the team already has one for this date', async () => {
    const eq2 = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'sz1',
          team_id: 'team-1',
          naam: '2026-2027',
          start_datum: null,
          eind_datum: null,
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      error: null,
    })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const select = vi.fn().mockReturnValue({ eq: eq1 })
    const insert = vi.fn()
    const from = vi.fn().mockReturnValue({ select, insert })
    const client = { from } as unknown as SupabaseClient
    const service = createSeizoenService(client, fakeAuth(authedSession))

    const seizoen = await service.getOrCreateSeasonForDate('team-1', '2026-09-07')

    expect(eq1).toHaveBeenCalledWith('team_id', 'team-1')
    expect(eq2).toHaveBeenCalledWith('naam', '2026-2027')
    expect(insert).not.toHaveBeenCalled()
    expect(seizoen).toEqual({
      id: 'sz1',
      teamId: 'team-1',
      naam: '2026-2027',
      startDatum: null,
      eindDatum: null,
      createdAt: '2026-01-01T00:00:00Z',
    })
  })

  it('creates a new season for the team, derived from the given date, when it does not exist yet', async () => {
    const eq2 = vi.fn().mockResolvedValue({ data: [], error: null })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const select = vi.fn().mockReturnValue({ eq: eq1 })
    const single = vi.fn().mockResolvedValue({
      data: {
        id: 'sz2',
        team_id: 'team-1',
        naam: '2026-2027',
        start_datum: null,
        eind_datum: null,
        created_at: '2026-01-03T00:00:00Z',
      },
      error: null,
    })
    const insertSelect = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select: insertSelect })
    const from = vi.fn().mockReturnValue({ select, insert })
    const client = { from } as unknown as SupabaseClient
    const service = createSeizoenService(client, fakeAuth(authedSession))

    const seizoen = await service.getOrCreateSeasonForDate('team-1', '2026-09-07')

    expect(from).toHaveBeenCalledWith('seizoen')
    expect(insert).toHaveBeenCalledWith({ team_id: 'team-1', naam: '2026-2027' })
    expect(seizoen).toEqual({
      id: 'sz2',
      teamId: 'team-1',
      naam: '2026-2027',
      startDatum: null,
      eindDatum: null,
      createdAt: '2026-01-03T00:00:00Z',
    })
  })

  it('surfaces a Postgres/RLS error from the insert instead of silently returning', async () => {
    const eq2 = vi.fn().mockResolvedValue({ data: [], error: null })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const select = vi.fn().mockReturnValue({ eq: eq1 })
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: new Error('permission denied for table seizoen'),
    })
    const insertSelect = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select: insertSelect })
    const from = vi.fn().mockReturnValue({ select, insert })
    const client = { from } as unknown as SupabaseClient
    const service = createSeizoenService(client, fakeAuth(authedSession))

    await expect(service.getOrCreateSeasonForDate('team-1', '2026-09-07')).rejects.toThrow(/permission denied/)
  })

  it('recovers from a concurrent insert race: a 23505 unique-violation on (team_id, naam) is treated as "someone else already created it", and re-selects the winning row', async () => {
    // First findByNaam (the initial check) sees no season yet; the insert
    // then loses the race to a concurrent call and comes back as a
    // unique-violation; the second findByNaam (the recovery re-select) sees
    // the row the other, winning call just inserted.
    const eq2 = vi
      .fn()
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'sz3',
            team_id: 'team-1',
            naam: '2026-2027',
            start_datum: null,
            eind_datum: null,
            created_at: '2026-01-04T00:00:00Z',
          },
        ],
        error: null,
      })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const select = vi.fn().mockReturnValue({ eq: eq1 })
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint "seizoen_team_id_naam_key"' },
    })
    const insertSelect = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select: insertSelect })
    const from = vi.fn().mockReturnValue({ select, insert })
    const client = { from } as unknown as SupabaseClient
    const service = createSeizoenService(client, fakeAuth(authedSession))

    const seizoen = await service.getOrCreateSeasonForDate('team-1', '2026-09-07')

    expect(insert).toHaveBeenCalledTimes(1)
    expect(eq2).toHaveBeenCalledTimes(2)
    expect(seizoen).toEqual({
      id: 'sz3',
      teamId: 'team-1',
      naam: '2026-2027',
      startDatum: null,
      eindDatum: null,
      createdAt: '2026-01-04T00:00:00Z',
    })
  })

  it('still surfaces the unique-violation if the post-race re-select unexpectedly finds nothing', async () => {
    const eq2 = vi
      .fn()
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const select = vi.fn().mockReturnValue({ eq: eq1 })
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint "seizoen_team_id_naam_key"' },
    })
    const insertSelect = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select: insertSelect })
    const from = vi.fn().mockReturnValue({ select, insert })
    const client = { from } as unknown as SupabaseClient
    const service = createSeizoenService(client, fakeAuth(authedSession))

    await expect(service.getOrCreateSeasonForDate('team-1', '2026-09-07')).rejects.toMatchObject({ code: '23505' })
  })

  it('does not treat a non-unique-violation insert error as a race and does not re-select', async () => {
    const eq2 = vi.fn().mockResolvedValueOnce({ data: [], error: null })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const select = vi.fn().mockReturnValue({ eq: eq1 })
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: new Error('permission denied for table seizoen'),
    })
    const insertSelect = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select: insertSelect })
    const from = vi.fn().mockReturnValue({ select, insert })
    const client = { from } as unknown as SupabaseClient
    const service = createSeizoenService(client, fakeAuth(authedSession))

    await expect(service.getOrCreateSeasonForDate('team-1', '2026-09-07')).rejects.toThrow(/permission denied/)
    expect(eq2).toHaveBeenCalledTimes(1)
  })
})
