import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthService } from '../authService'
import type { Speler } from '../types'
import { createAanwezigheidService } from '../aanwezigheidService'

function fakeAuth(session: unknown): AuthService {
  return {
    signIn: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn().mockResolvedValue(session),
    onAuthStateChange: vi.fn(() => () => {}),
  }
}

const authedSession = { user: { id: 'coach-1' } }

const speler1: Speler = {
  id: 's1',
  teamId: 'team-1',
  naam: 'Jan Jansen',
  rugnummer: 9,
  opmerkingen: null,
  status: 'actief',
  createdAt: '2026-01-01T00:00:00Z',
}

const speler2: Speler = {
  id: 's2',
  teamId: 'team-1',
  naam: 'Piet Peters',
  rugnummer: 5,
  opmerkingen: null,
  status: 'actief',
  createdAt: '2026-01-01T00:00:00Z',
}

describe('aanwezigheidService.listForMatch', () => {
  it('rejects and never queries the database when there is no active session', async () => {
    const from = vi.fn()
    const client = { from } as unknown as SupabaseClient
    const service = createAanwezigheidService(client, fakeAuth(null))

    await expect(service.listForMatch('w1', [speler1])).rejects.toThrow(/niet ingelogd/i)
    expect(from).not.toHaveBeenCalled()
  })

  it('defaults every active player to aanwezig/no fitheid when no aanwezigheid rows exist yet', async () => {
    const eq = vi.fn().mockResolvedValue({ data: [], error: null })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })
    const client = { from } as unknown as SupabaseClient
    const service = createAanwezigheidService(client, fakeAuth(authedSession))

    const regels = await service.listForMatch('w1', [speler1, speler2])

    expect(from).toHaveBeenCalledWith('aanwezigheid')
    expect(eq).toHaveBeenCalledWith('wedstrijd_id', 'w1')
    expect(regels).toEqual([
      { speler: speler1, status: 'aanwezig', fitheidStatus: null },
      { speler: speler2, status: 'aanwezig', fitheidStatus: null },
    ])
  })

  it('overrides the default for a player with an existing row, but leaves other players on the default', async () => {
    const rows = [
      { id: 'a1', wedstrijd_id: 'w1', speler_id: 's1', status: 'afgemeld', fitheid_status: null, created_at: '2026-01-02T00:00:00Z' },
    ]
    const eq = vi.fn().mockResolvedValue({ data: rows, error: null })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })
    const client = { from } as unknown as SupabaseClient
    const service = createAanwezigheidService(client, fakeAuth(authedSession))

    const regels = await service.listForMatch('w1', [speler1, speler2])

    expect(regels).toEqual([
      { speler: speler1, status: 'afgemeld', fitheidStatus: null },
      { speler: speler2, status: 'aanwezig', fitheidStatus: null },
    ])
  })

  it('reflects a fitheid_status recorded on an existing (still aanwezig) row', async () => {
    const rows = [
      { id: 'a1', wedstrijd_id: 'w1', speler_id: 's2', status: 'aanwezig', fitheid_status: 'let_op', created_at: '2026-01-02T00:00:00Z' },
    ]
    const eq = vi.fn().mockResolvedValue({ data: rows, error: null })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })
    const client = { from } as unknown as SupabaseClient
    const service = createAanwezigheidService(client, fakeAuth(authedSession))

    const regels = await service.listForMatch('w1', [speler1, speler2])

    expect(regels).toEqual([
      { speler: speler1, status: 'aanwezig', fitheidStatus: null },
      { speler: speler2, status: 'aanwezig', fitheidStatus: 'let_op' },
    ])
  })

  it('surfaces a Postgres/RLS error instead of silently returning defaults', async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: new Error('permission denied for table aanwezigheid') })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })
    const client = { from } as unknown as SupabaseClient
    const service = createAanwezigheidService(client, fakeAuth(authedSession))

    await expect(service.listForMatch('w1', [speler1])).rejects.toThrow(/permission denied/)
  })
})

describe('aanwezigheidService.setStatus', () => {
  it('rejects and never queries the database when there is no active session', async () => {
    const from = vi.fn()
    const client = { from } as unknown as SupabaseClient
    const service = createAanwezigheidService(client, fakeAuth(null))

    await expect(service.setStatus('w1', 's1', 'afgemeld')).rejects.toThrow(/niet ingelogd/i)
    expect(from).not.toHaveBeenCalled()
  })

  it('upserts on (wedstrijd_id, speler_id), touching only the status column', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: 'a1',
        wedstrijd_id: 'w1',
        speler_id: 's1',
        status: 'afgemeld',
        fitheid_status: null,
        created_at: '2026-01-02T00:00:00Z',
      },
      error: null,
    })
    const select = vi.fn().mockReturnValue({ single })
    const upsert = vi.fn().mockReturnValue({ select })
    const from = vi.fn().mockReturnValue({ upsert })
    const client = { from } as unknown as SupabaseClient
    const service = createAanwezigheidService(client, fakeAuth(authedSession))

    const result = await service.setStatus('w1', 's1', 'afgemeld')

    expect(from).toHaveBeenCalledWith('aanwezigheid')
    expect(upsert).toHaveBeenCalledWith(
      { wedstrijd_id: 'w1', speler_id: 's1', status: 'afgemeld' },
      { onConflict: 'wedstrijd_id,speler_id' },
    )
    expect(result).toEqual({
      id: 'a1',
      wedstrijdId: 'w1',
      spelerId: 's1',
      status: 'afgemeld',
      fitheidStatus: null,
      createdAt: '2026-01-02T00:00:00Z',
    })
  })

  it('surfaces a Postgres/RLS error from the upsert instead of silently returning', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: new Error('permission denied for table aanwezigheid') })
    const select = vi.fn().mockReturnValue({ single })
    const upsert = vi.fn().mockReturnValue({ select })
    const from = vi.fn().mockReturnValue({ upsert })
    const client = { from } as unknown as SupabaseClient
    const service = createAanwezigheidService(client, fakeAuth(authedSession))

    await expect(service.setStatus('w1', 's1', 'afgemeld')).rejects.toThrow(/permission denied/)
  })
})

describe('aanwezigheidService.setFitheid', () => {
  it('rejects and never queries the database when there is no active session', async () => {
    const from = vi.fn()
    const client = { from } as unknown as SupabaseClient
    const service = createAanwezigheidService(client, fakeAuth(null))

    await expect(service.setFitheid('w1', 's1', 'fit')).rejects.toThrow(/niet ingelogd/i)
    expect(from).not.toHaveBeenCalled()
  })

  it('upserts on (wedstrijd_id, speler_id), touching only the fitheid_status column', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: 'a1',
        wedstrijd_id: 'w1',
        speler_id: 's1',
        status: 'aanwezig',
        fitheid_status: 'geblesseerd',
        created_at: '2026-01-02T00:00:00Z',
      },
      error: null,
    })
    const select = vi.fn().mockReturnValue({ single })
    const upsert = vi.fn().mockReturnValue({ select })
    const from = vi.fn().mockReturnValue({ upsert })
    const client = { from } as unknown as SupabaseClient
    const service = createAanwezigheidService(client, fakeAuth(authedSession))

    const result = await service.setFitheid('w1', 's1', 'geblesseerd')

    expect(upsert).toHaveBeenCalledWith(
      { wedstrijd_id: 'w1', speler_id: 's1', fitheid_status: 'geblesseerd' },
      { onConflict: 'wedstrijd_id,speler_id' },
    )
    expect(result.fitheidStatus).toBe('geblesseerd')
    expect(result.status).toBe('aanwezig')
  })
})
