import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthService } from '../authService'
import type { SeizoenService } from '../seizoenService'
import type { Seizoen } from '../types'
import { createWedstrijdService } from '../wedstrijdService'

function fakeAuth(session: unknown): AuthService {
  return {
    signIn: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn().mockResolvedValue(session),
    onAuthStateChange: vi.fn(() => () => {}),
  }
}

const authedSession = { user: { id: 'coach-1' } }

const fakeSeizoen: Seizoen = {
  id: 'seizoen-1',
  teamId: 'team-1',
  naam: '2026-2027',
  startDatum: null,
  eindDatum: null,
  createdAt: '2026-01-01T00:00:00Z',
}

function fakeSeizoenService(overrides: Partial<SeizoenService> = {}): SeizoenService {
  return {
    list: vi.fn().mockResolvedValue([fakeSeizoen]),
    getOrCreateSeasonForDate: vi.fn().mockResolvedValue(fakeSeizoen),
    ...overrides,
  }
}

describe('wedstrijdService.create', () => {
  it('rejects and never queries the database when there is no active session', async () => {
    const from = vi.fn()
    const client = { from } as unknown as SupabaseClient
    const seizoenService = fakeSeizoenService()
    const service = createWedstrijdService(client, fakeAuth(null), seizoenService)

    await expect(
      service.create({ teamId: 'team-1', datum: '2026-09-20', formaat: '8v8' }),
    ).rejects.toThrow(/niet ingelogd/i)
    expect(from).not.toHaveBeenCalled()
    expect(seizoenService.getOrCreateSeasonForDate).not.toHaveBeenCalled()
  })

  it('rejects a blank datum without ever calling the database', async () => {
    const from = vi.fn()
    const client = { from } as unknown as SupabaseClient
    const seizoenService = fakeSeizoenService()
    const service = createWedstrijdService(client, fakeAuth(authedSession), seizoenService)

    await expect(
      service.create({ teamId: 'team-1', datum: '   ', formaat: '8v8' }),
    ).rejects.toThrow(/datum is verplicht/i)
    expect(from).not.toHaveBeenCalled()
    expect(seizoenService.getOrCreateSeasonForDate).not.toHaveBeenCalled()
  })

  it('defaults formatie to 1-3-3-1 for 8v8 when omitted, and resolves/creates the season from datum', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: 'w1',
        seizoen_id: 'seizoen-1',
        datum: '2026-09-20',
        formaat: '8v8',
        formatie: '1-3-3-1',
        tegenstander: null,
        eigen_score: null,
        tegen_score: null,
        thuis_uit: null,
        created_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    })
    const insertSelect = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select: insertSelect })
    const from = vi.fn().mockReturnValue({ insert })
    const client = { from } as unknown as SupabaseClient
    const seizoenService = fakeSeizoenService()
    const service = createWedstrijdService(client, fakeAuth(authedSession), seizoenService)

    const wedstrijd = await service.create({ teamId: 'team-1', datum: '2026-09-20', formaat: '8v8' })

    expect(seizoenService.getOrCreateSeasonForDate).toHaveBeenCalledWith('team-1', '2026-09-20')
    expect(from).toHaveBeenCalledWith('wedstrijd')
    expect(insert).toHaveBeenCalledWith({
      seizoen_id: 'seizoen-1',
      datum: '2026-09-20',
      formaat: '8v8',
      formatie: '1-3-3-1',
      tegenstander: null,
      eigen_score: null,
      tegen_score: null,
      thuis_uit: null,
    })
    expect(wedstrijd.formatie).toBe('1-3-3-1')
    expect(wedstrijd.seizoenId).toBe('seizoen-1')
  })

  it('defaults formatie to 1-4-3-3 for 11v11 when omitted', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: 'w2',
        seizoen_id: 'seizoen-1',
        datum: '2026-09-20',
        formaat: '11v11',
        formatie: '1-4-3-3',
        tegenstander: null,
        eigen_score: null,
        tegen_score: null,
        thuis_uit: null,
        created_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    })
    const insertSelect = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select: insertSelect })
    const from = vi.fn().mockReturnValue({ insert })
    const client = { from } as unknown as SupabaseClient
    const service = createWedstrijdService(client, fakeAuth(authedSession), fakeSeizoenService())

    const wedstrijd = await service.create({ teamId: 'team-1', datum: '2026-09-20', formaat: '11v11' })

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ formaat: '11v11', formatie: '1-4-3-3' }))
    expect(wedstrijd.formatie).toBe('1-4-3-3')
  })

  it('accepts an explicit alternative formatie that is valid for the format', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: 'w3',
        seizoen_id: 'seizoen-1',
        datum: '2026-09-20',
        formaat: '8v8',
        formatie: '1-2-3-2',
        tegenstander: null,
        eigen_score: null,
        tegen_score: null,
        thuis_uit: null,
        created_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    })
    const insertSelect = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select: insertSelect })
    const from = vi.fn().mockReturnValue({ insert })
    const client = { from } as unknown as SupabaseClient
    const service = createWedstrijdService(client, fakeAuth(authedSession), fakeSeizoenService())

    const wedstrijd = await service.create({
      teamId: 'team-1',
      datum: '2026-09-20',
      formaat: '8v8',
      formatie: '1-2-3-2',
    })

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ formatie: '1-2-3-2' }))
    expect(wedstrijd.formatie).toBe('1-2-3-2')
  })

  it('rejects a formatie that does not belong to the given formaat, without calling the database', async () => {
    const from = vi.fn()
    const client = { from } as unknown as SupabaseClient
    const seizoenService = fakeSeizoenService()
    const service = createWedstrijdService(client, fakeAuth(authedSession), seizoenService)

    await expect(
      service.create({ teamId: 'team-1', datum: '2026-09-20', formaat: '8v8', formatie: '1-4-3-3' }),
    ).rejects.toThrow(/ongeldige formatie/i)
    expect(from).not.toHaveBeenCalled()
    expect(seizoenService.getOrCreateSeasonForDate).not.toHaveBeenCalled()
  })

  it('passes through optional match-info fields when given', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: 'w4',
        seizoen_id: 'seizoen-1',
        datum: '2026-09-20',
        formaat: '8v8',
        formatie: '1-3-3-1',
        tegenstander: 'FC Voorbeeld',
        eigen_score: 3,
        tegen_score: 1,
        thuis_uit: 'thuis',
        created_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    })
    const insertSelect = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select: insertSelect })
    const from = vi.fn().mockReturnValue({ insert })
    const client = { from } as unknown as SupabaseClient
    const service = createWedstrijdService(client, fakeAuth(authedSession), fakeSeizoenService())

    const wedstrijd = await service.create({
      teamId: 'team-1',
      datum: '2026-09-20',
      formaat: '8v8',
      tegenstander: 'FC Voorbeeld',
      eigenScore: 3,
      tegenScore: 1,
      thuisUit: 'thuis',
    })

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tegenstander: 'FC Voorbeeld',
        eigen_score: 3,
        tegen_score: 1,
        thuis_uit: 'thuis',
      }),
    )
    expect(wedstrijd.tegenstander).toBe('FC Voorbeeld')
  })

  it('surfaces a Postgres/RLS error from the insert instead of silently returning', async () => {
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: new Error('permission denied for table wedstrijd'),
    })
    const insertSelect = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select: insertSelect })
    const from = vi.fn().mockReturnValue({ insert })
    const client = { from } as unknown as SupabaseClient
    const service = createWedstrijdService(client, fakeAuth(authedSession), fakeSeizoenService())

    await expect(service.create({ teamId: 'team-1', datum: '2026-09-20', formaat: '8v8' })).rejects.toThrow(
      /permission denied/,
    )
  })
})

describe('wedstrijdService.list', () => {
  it('rejects and never queries the database when there is no active session', async () => {
    const from = vi.fn()
    const client = { from } as unknown as SupabaseClient
    const service = createWedstrijdService(client, fakeAuth(null), fakeSeizoenService())

    await expect(service.list('team-1')).rejects.toThrow(/niet ingelogd/i)
    expect(from).not.toHaveBeenCalled()
  })

  it('returns an empty list without querying wedstrijd when the team has no seasons yet', async () => {
    const from = vi.fn()
    const client = { from } as unknown as SupabaseClient
    const seizoenService = fakeSeizoenService({ list: vi.fn().mockResolvedValue([]) })
    const service = createWedstrijdService(client, fakeAuth(authedSession), seizoenService)

    await expect(service.list('team-1')).resolves.toEqual([])
    expect(from).not.toHaveBeenCalled()
  })

  it("fetches the team's matches across its seasons, most recent first", async () => {
    const rows = [
      {
        id: 'w1',
        seizoen_id: 'seizoen-1',
        datum: '2026-09-01',
        formaat: '8v8',
        formatie: '1-3-3-1',
        tegenstander: null,
        eigen_score: null,
        tegen_score: null,
        thuis_uit: null,
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'w2',
        seizoen_id: 'seizoen-1',
        datum: '2026-09-15',
        formaat: '11v11',
        formatie: '1-4-3-3',
        tegenstander: null,
        eigen_score: null,
        tegen_score: null,
        thuis_uit: null,
        created_at: '2026-01-02T00:00:00Z',
      },
    ]
    const inFn = vi.fn().mockResolvedValue({ data: rows, error: null })
    const select = vi.fn().mockReturnValue({ in: inFn })
    const from = vi.fn().mockReturnValue({ select })
    const client = { from } as unknown as SupabaseClient
    const service = createWedstrijdService(client, fakeAuth(authedSession), fakeSeizoenService())

    const wedstrijden = await service.list('team-1')

    expect(from).toHaveBeenCalledWith('wedstrijd')
    expect(inFn).toHaveBeenCalledWith('seizoen_id', ['seizoen-1'])
    expect(wedstrijden.map((w) => w.id)).toEqual(['w2', 'w1'])
  })

  it('surfaces a Postgres/RLS error instead of silently returning matches', async () => {
    const inFn = vi.fn().mockResolvedValue({ data: null, error: new Error('permission denied for table wedstrijd') })
    const select = vi.fn().mockReturnValue({ in: inFn })
    const from = vi.fn().mockReturnValue({ select })
    const client = { from } as unknown as SupabaseClient
    const service = createWedstrijdService(client, fakeAuth(authedSession), fakeSeizoenService())

    await expect(service.list('team-1')).rejects.toThrow(/permission denied/)
  })
})

describe('wedstrijdService.updateKwartDuur', () => {
  it('rejects and never queries the database when there is no active session', async () => {
    const from = vi.fn()
    const client = { from } as unknown as SupabaseClient
    const service = createWedstrijdService(client, fakeAuth(null), fakeSeizoenService())

    await expect(service.updateKwartDuur('w1', 900)).rejects.toThrow(/niet ingelogd/i)
    expect(from).not.toHaveBeenCalled()
  })

  it('rejects a non-positive duration without ever calling the database', async () => {
    const from = vi.fn()
    const client = { from } as unknown as SupabaseClient
    const service = createWedstrijdService(client, fakeAuth(authedSession), fakeSeizoenService())

    await expect(service.updateKwartDuur('w1', 0)).rejects.toThrow(/positief aantal seconden/i)
    expect(from).not.toHaveBeenCalled()
  })

  it('updates kwart_duur_seconden for the given match and returns the updated wedstrijd', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: 'w1',
        seizoen_id: 'seizoen-1',
        datum: '2026-09-20',
        formaat: '8v8',
        formatie: '1-3-3-1',
        tegenstander: null,
        eigen_score: null,
        tegen_score: null,
        thuis_uit: null,
        kwart_duur_seconden: 900,
        created_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    })
    const updateSelect = vi.fn().mockReturnValue({ single })
    const eq = vi.fn().mockReturnValue({ select: updateSelect })
    const update = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ update })
    const client = { from } as unknown as SupabaseClient
    const service = createWedstrijdService(client, fakeAuth(authedSession), fakeSeizoenService())

    const wedstrijd = await service.updateKwartDuur('w1', 900)

    expect(from).toHaveBeenCalledWith('wedstrijd')
    expect(update).toHaveBeenCalledWith({ kwart_duur_seconden: 900 })
    expect(eq).toHaveBeenCalledWith('id', 'w1')
    expect(wedstrijd.kwartDuurSeconden).toBe(900)
  })

  it('surfaces a Postgres/RLS error from the update instead of silently returning', async () => {
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: new Error('permission denied for table wedstrijd'),
    })
    const updateSelect = vi.fn().mockReturnValue({ single })
    const eq = vi.fn().mockReturnValue({ select: updateSelect })
    const update = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ update })
    const client = { from } as unknown as SupabaseClient
    const service = createWedstrijdService(client, fakeAuth(authedSession), fakeSeizoenService())

    await expect(service.updateKwartDuur('w1', 900)).rejects.toThrow(/permission denied/)
  })
})
