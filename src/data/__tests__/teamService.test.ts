import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthService } from '../authService'
import { createTeamService } from '../teamService'

function fakeAuth(session: unknown): AuthService {
  return {
    signIn: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn().mockResolvedValue(session),
    onAuthStateChange: vi.fn(() => () => {}),
  }
}

describe('teamService.getMyTeams', () => {
  it('rejects and never queries the database when there is no active session', async () => {
    const from = vi.fn()
    const client = { from } as unknown as SupabaseClient
    const service = createTeamService(client, fakeAuth(null))

    await expect(service.getMyTeams()).rejects.toThrow(/niet ingelogd/i)
    expect(from).not.toHaveBeenCalled()
  })

  it('returns exactly what the RLS-scoped query returns, without adding its own client-side filter', async () => {
    const select = vi.fn().mockResolvedValue({
      data: [{ id: 't1', coach_user_id: 'coach-1', naam: 'JO11-1', created_at: '2026-01-01T00:00:00Z' }],
      error: null,
    })
    const from = vi.fn().mockReturnValue({ select })
    const client = { from } as unknown as SupabaseClient
    const service = createTeamService(client, fakeAuth({ user: { id: 'coach-1' } }))

    const teams = await service.getMyTeams()

    // Proves the query relies on RLS (team.coach_user_id = auth.uid() at the
    // database level) rather than re-filtering by user id in the client.
    expect(from).toHaveBeenCalledWith('team')
    expect(select).toHaveBeenCalledWith('*')
    expect(teams).toEqual([
      { id: 't1', coachUserId: 'coach-1', naam: 'JO11-1', createdAt: '2026-01-01T00:00:00Z' },
    ])
  })

  it('returns an empty list when RLS lets the query through but there are no rows', async () => {
    const select = vi.fn().mockResolvedValue({ data: [], error: null })
    const from = vi.fn().mockReturnValue({ select })
    const client = { from } as unknown as SupabaseClient
    const service = createTeamService(client, fakeAuth({ user: { id: 'coach-1' } }))

    await expect(service.getMyTeams()).resolves.toEqual([])
  })

  it('surfaces a Postgres/RLS error instead of silently returning teams', async () => {
    const select = vi.fn().mockResolvedValue({
      data: null,
      error: new Error('permission denied for table team'),
    })
    const from = vi.fn().mockReturnValue({ select })
    const client = { from } as unknown as SupabaseClient
    const service = createTeamService(client, fakeAuth({ user: { id: 'coach-1' } }))

    await expect(service.getMyTeams()).rejects.toThrow(/permission denied/)
  })
})
