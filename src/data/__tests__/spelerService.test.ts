import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthService } from '../authService'
import { createSpelerService } from '../spelerService'

function fakeAuth(session: unknown): AuthService {
  return {
    signIn: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn().mockResolvedValue(session),
    onAuthStateChange: vi.fn(() => () => {}),
  }
}

const authedSession = { user: { id: 'coach-1' } }

const rowA = {
  id: 's1',
  team_id: 'team-1',
  naam: 'Jan',
  rugnummer: 4,
  opmerkingen: null,
  status: 'actief',
  created_at: '2026-01-01T00:00:00Z',
}

const rowB = {
  id: 's2',
  team_id: 'team-1',
  naam: 'Piet',
  rugnummer: null,
  opmerkingen: 'Speelt liever niet als keeper',
  status: 'inactief',
  created_at: '2026-01-02T00:00:00Z',
}

function mockSelectChain(result: { data: unknown; error: unknown }) {
  const inFn = vi.fn().mockResolvedValue(result)
  const eqFn = vi.fn().mockReturnValue({ in: inFn })
  const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
  const from = vi.fn().mockReturnValue({ select: selectFn })
  return { from, selectFn, eqFn, inFn }
}

function mockInsertChain(result: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(result)
  const select = vi.fn().mockReturnValue({ single })
  const insert = vi.fn().mockReturnValue({ select })
  const from = vi.fn().mockReturnValue({ insert })
  return { from, insert, select, single }
}

function mockUpdateChain(result: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(result)
  const select = vi.fn().mockReturnValue({ single })
  const eq = vi.fn().mockReturnValue({ select })
  const update = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ update })
  return { from, update, eq, select, single }
}

describe('spelerService.list', () => {
  it('rejects and never queries the database when there is no active session', async () => {
    const from = vi.fn()
    const client = { from } as unknown as SupabaseClient
    const service = createSpelerService(client, fakeAuth(null))

    await expect(service.list('team-1')).rejects.toThrow(/niet ingelogd/i)
    expect(from).not.toHaveBeenCalled()
  })

  it('defaults to active players only, scoped to the given team', async () => {
    const { from, selectFn, eqFn, inFn } = mockSelectChain({ data: [rowA], error: null })
    const client = { from } as unknown as SupabaseClient
    const service = createSpelerService(client, fakeAuth(authedSession))

    const players = await service.list('team-1')

    expect(from).toHaveBeenCalledWith('speler')
    expect(selectFn).toHaveBeenCalledWith('*')
    expect(eqFn).toHaveBeenCalledWith('team_id', 'team-1')
    expect(inFn).toHaveBeenCalledWith('status', ['actief'])
    expect(players).toEqual([
      { id: 's1', teamId: 'team-1', naam: 'Jan', rugnummer: 4, opmerkingen: null, status: 'actief', createdAt: '2026-01-01T00:00:00Z' },
    ])
  })

  it('includes inactive players when includeInactive is set — proves inactive rows still exist and stay fetchable, not deleted', async () => {
    const { inFn } = mockSelectChain({ data: [rowA, rowB], error: null })
    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ in: inFn }) }),
    })
    const client = { from } as unknown as SupabaseClient
    const service = createSpelerService(client, fakeAuth(authedSession))

    const players = await service.list('team-1', { includeInactive: true })

    expect(inFn).toHaveBeenCalledWith('status', ['actief', 'inactief'])
    expect(players.map((p) => p.naam)).toEqual(['Jan', 'Piet'])
    expect(players.find((p) => p.id === 's2')).toEqual({
      id: 's2',
      teamId: 'team-1',
      naam: 'Piet',
      rugnummer: null,
      opmerkingen: 'Speelt liever niet als keeper',
      status: 'inactief',
      createdAt: '2026-01-02T00:00:00Z',
    })
  })

  it('surfaces a Postgres/RLS error instead of silently returning players', async () => {
    const { from } = mockSelectChain({
      data: null,
      error: new Error('permission denied for table speler'),
    })
    const client = { from } as unknown as SupabaseClient
    const service = createSpelerService(client, fakeAuth(authedSession))

    await expect(service.list('team-1')).rejects.toThrow(/permission denied/)
  })
})

describe('spelerService.create', () => {
  it('rejects and never inserts when there is no active session', async () => {
    const from = vi.fn()
    const client = { from } as unknown as SupabaseClient
    const service = createSpelerService(client, fakeAuth(null))

    await expect(service.create({ teamId: 'team-1', naam: 'Jan' })).rejects.toThrow(/niet ingelogd/i)
    expect(from).not.toHaveBeenCalled()
  })

  it('rejects a blank naam without ever calling the database', async () => {
    const from = vi.fn()
    const client = { from } as unknown as SupabaseClient
    const service = createSpelerService(client, fakeAuth(authedSession))

    await expect(service.create({ teamId: 'team-1', naam: '   ' })).rejects.toThrow(/naam is verplicht/i)
    expect(from).not.toHaveBeenCalled()
  })

  it('inserts a new player, defaulting optional fields to null', async () => {
    const { from, insert } = mockInsertChain({ data: rowA, error: null })
    const client = { from } as unknown as SupabaseClient
    const service = createSpelerService(client, fakeAuth(authedSession))

    const speler = await service.create({ teamId: 'team-1', naam: 'Jan', rugnummer: 4 })

    expect(from).toHaveBeenCalledWith('speler')
    expect(insert).toHaveBeenCalledWith({
      team_id: 'team-1',
      naam: 'Jan',
      rugnummer: 4,
      opmerkingen: null,
    })
    expect(speler.naam).toBe('Jan')
    expect(speler.status).toBe('actief')
  })

  it('trims the naam before inserting', async () => {
    const { insert } = mockInsertChain({ data: rowA, error: null })
    const from = vi.fn().mockReturnValue({ insert })
    const client = { from } as unknown as SupabaseClient
    const service = createSpelerService(client, fakeAuth(authedSession))

    await service.create({ teamId: 'team-1', naam: '  Jan  ' })

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ naam: 'Jan' }),
    )
  })
})

describe('spelerService.update', () => {
  it('rejects a blank naam without calling the database', async () => {
    const from = vi.fn()
    const client = { from } as unknown as SupabaseClient
    const service = createSpelerService(client, fakeAuth(authedSession))

    await expect(service.update('s1', { naam: '  ' })).rejects.toThrow(/naam is verplicht/i)
    expect(from).not.toHaveBeenCalled()
  })

  it('updates only the given fields, by id', async () => {
    const updatedRow = { ...rowA, naam: 'Jan Jansen', rugnummer: 9 }
    const { from, update, eq } = mockUpdateChain({ data: updatedRow, error: null })
    const client = { from } as unknown as SupabaseClient
    const service = createSpelerService(client, fakeAuth(authedSession))

    const speler = await service.update('s1', { naam: 'Jan Jansen', rugnummer: 9 })

    expect(from).toHaveBeenCalledWith('speler')
    expect(update).toHaveBeenCalledWith({ naam: 'Jan Jansen', rugnummer: 9 })
    expect(eq).toHaveBeenCalledWith('id', 's1')
    expect(speler.naam).toBe('Jan Jansen')
    expect(speler.rugnummer).toBe(9)
  })

  it('can clear opmerkingen by setting it to null', async () => {
    const updatedRow = { ...rowA, opmerkingen: null }
    const { update } = mockUpdateChain({ data: updatedRow, error: null })
    const from = vi.fn().mockReturnValue({ update })
    const client = { from } as unknown as SupabaseClient
    const service = createSpelerService(client, fakeAuth(authedSession))

    await service.update('s1', { opmerkingen: null })

    expect(update).toHaveBeenCalledWith({ opmerkingen: null })
  })
})

describe('spelerService.setStatus', () => {
  it('rejects and never queries the database when there is no active session', async () => {
    const from = vi.fn()
    const client = { from } as unknown as SupabaseClient
    const service = createSpelerService(client, fakeAuth(null))

    await expect(service.setStatus('s1', 'inactief')).rejects.toThrow(/niet ingelogd/i)
    expect(from).not.toHaveBeenCalled()
  })

  it('sets a player to inactief without deleting the row — the row still comes back with its data intact', async () => {
    const inactiveRow = { ...rowA, status: 'inactief' }
    const { from, update, eq } = mockUpdateChain({ data: inactiveRow, error: null })
    const client = { from } as unknown as SupabaseClient
    const service = createSpelerService(client, fakeAuth(authedSession))

    const speler = await service.setStatus('s1', 'inactief')

    expect(from).toHaveBeenCalledWith('speler')
    expect(update).toHaveBeenCalledWith({ status: 'inactief' })
    expect(eq).toHaveBeenCalledWith('id', 's1')
    expect(speler).toEqual({
      id: 's1',
      teamId: 'team-1',
      naam: 'Jan',
      rugnummer: 4,
      opmerkingen: null,
      status: 'inactief',
      createdAt: '2026-01-01T00:00:00Z',
    })
  })

  it('can reactivate a player by setting status back to actief', async () => {
    const { update } = mockUpdateChain({ data: rowA, error: null })
    const from = vi.fn().mockReturnValue({ update })
    const client = { from } as unknown as SupabaseClient
    const service = createSpelerService(client, fakeAuth(authedSession))

    const speler = await service.setStatus('s1', 'actief')

    expect(update).toHaveBeenCalledWith({ status: 'actief' })
    expect(speler.status).toBe('actief')
  })

  it('surfaces a Postgres/RLS error instead of silently succeeding', async () => {
    const { from } = mockUpdateChain({ data: null, error: new Error('permission denied for table speler') })
    const client = { from } as unknown as SupabaseClient
    const service = createSpelerService(client, fakeAuth(authedSession))

    await expect(service.setStatus('s1', 'inactief')).rejects.toThrow(/permission denied/)
  })
})
