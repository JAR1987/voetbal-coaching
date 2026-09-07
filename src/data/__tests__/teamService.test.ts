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

describe('teamService.getOrCreateMyTeam', () => {
  it('rejects and never queries the database when there is no active session', async () => {
    const from = vi.fn()
    const client = { from } as unknown as SupabaseClient
    const service = createTeamService(client, fakeAuth(null))

    await expect(service.getOrCreateMyTeam()).rejects.toThrow(/niet ingelogd/i)
    expect(from).not.toHaveBeenCalled()
  })

  it('returns the existing team without inserting a new one when the coach already has one', async () => {
    const select = vi.fn().mockResolvedValue({
      data: [{ id: 't1', coach_user_id: 'coach-1', naam: 'JO11-1', created_at: '2026-01-01T00:00:00Z' }],
      error: null,
    })
    const insert = vi.fn()
    const from = vi.fn().mockReturnValue({ select, insert })
    const client = { from } as unknown as SupabaseClient
    const service = createTeamService(client, fakeAuth({ user: { id: 'coach-1' } }))

    const team = await service.getOrCreateMyTeam()

    expect(team).toEqual({ id: 't1', coachUserId: 'coach-1', naam: 'JO11-1', createdAt: '2026-01-01T00:00:00Z' })
    expect(insert).not.toHaveBeenCalled()
  })

  it('creates a new team for the signed-in coach when they have none yet', async () => {
    const select = vi.fn().mockResolvedValue({ data: [], error: null })
    const single = vi.fn().mockResolvedValue({
      data: { id: 't2', coach_user_id: 'coach-1', naam: 'Mijn team', created_at: '2026-01-03T00:00:00Z' },
      error: null,
    })
    const insertSelect = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select: insertSelect })
    const from = vi.fn().mockReturnValue({ select, insert })
    const client = { from } as unknown as SupabaseClient
    const service = createTeamService(client, fakeAuth({ user: { id: 'coach-1' } }))

    const team = await service.getOrCreateMyTeam()

    expect(from).toHaveBeenCalledWith('team')
    expect(insert).toHaveBeenCalledWith({ coach_user_id: 'coach-1', naam: 'Mijn team' })
    expect(team).toEqual({ id: 't2', coachUserId: 'coach-1', naam: 'Mijn team', createdAt: '2026-01-03T00:00:00Z' })
  })

  it('surfaces a Postgres/RLS error from the insert instead of silently returning', async () => {
    const select = vi.fn().mockResolvedValue({ data: [], error: null })
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: new Error('permission denied for table team'),
    })
    const insertSelect = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select: insertSelect })
    const from = vi.fn().mockReturnValue({ select, insert })
    const client = { from } as unknown as SupabaseClient
    const service = createTeamService(client, fakeAuth({ user: { id: 'coach-1' } }))

    await expect(service.getOrCreateMyTeam()).rejects.toThrow(/permission denied/)
  })

  it('recovers from a concurrent insert race: a 23505 unique-violation on coach_user_id is treated as "someone else already created it", and re-selects the winning row', async () => {
    // First getMyTeams() (the initial check) sees no team yet; the insert
    // then loses the race to a concurrent call and comes back as a
    // unique-violation; the second getMyTeams() (the recovery re-select)
    // sees the row the other, winning call just inserted.
    const select = vi
      .fn()
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({
        data: [{ id: 't3', coach_user_id: 'coach-1', naam: 'JO11-1', created_at: '2026-01-04T00:00:00Z' }],
        error: null,
      })
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint "team_coach_user_id_key"' },
    })
    const insertSelect = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select: insertSelect })
    const from = vi.fn().mockReturnValue({ select, insert })
    const client = { from } as unknown as SupabaseClient
    const service = createTeamService(client, fakeAuth({ user: { id: 'coach-1' } }))

    const team = await service.getOrCreateMyTeam()

    expect(insert).toHaveBeenCalledTimes(1)
    expect(select).toHaveBeenCalledTimes(2)
    expect(team).toEqual({ id: 't3', coachUserId: 'coach-1', naam: 'JO11-1', createdAt: '2026-01-04T00:00:00Z' })
  })

  it('still surfaces the unique-violation if the post-race re-select unexpectedly finds nothing', async () => {
    const select = vi
      .fn()
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null })
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint "team_coach_user_id_key"' },
    })
    const insertSelect = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select: insertSelect })
    const from = vi.fn().mockReturnValue({ select, insert })
    const client = { from } as unknown as SupabaseClient
    const service = createTeamService(client, fakeAuth({ user: { id: 'coach-1' } }))

    await expect(service.getOrCreateMyTeam()).rejects.toMatchObject({ code: '23505' })
  })

  it('does not treat a non-unique-violation insert error as a race and does not re-select', async () => {
    const select = vi.fn().mockResolvedValueOnce({ data: [], error: null })
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: new Error('permission denied for table team'),
    })
    const insertSelect = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select: insertSelect })
    const from = vi.fn().mockReturnValue({ select, insert })
    const client = { from } as unknown as SupabaseClient
    const service = createTeamService(client, fakeAuth({ user: { id: 'coach-1' } }))

    await expect(service.getOrCreateMyTeam()).rejects.toThrow(/permission denied/)
    expect(select).toHaveBeenCalledTimes(1)
  })
})
