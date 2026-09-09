import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthService } from '../authService'
import { createOpstellingService } from '../opstellingService'

function fakeAuth(session: unknown): AuthService {
  return {
    signIn: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn().mockResolvedValue(session),
    onAuthStateChange: vi.fn(() => () => {}),
  }
}

const authedSession = { user: { id: 'coach-1' } }

/** A minimal chained-`vi.fn()` fake mirroring the real `from(...).select(...)`
 * / `.update(...)` / `.insert(...)` shapes, tracking every update in order. */
function fakeClient(rows: { id: string; speler_id: string; positie: string }[]) {
  const updateCalls: { id: string; patch: Record<string, unknown> }[] = []
  const insertCalls: Record<string, unknown>[] = []

  const from = vi.fn((_table: string) => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ data: rows, error: null }),
      })),
    })),
    update: vi.fn((patch: Record<string, unknown>) => ({
      eq: vi.fn((_col: string, id: string) => {
        updateCalls.push({ id, patch })
        const row = rows.find((r) => r.id === id)
        if (row) Object.assign(row, patch)
        return Promise.resolve({ error: null })
      }),
    })),
    insert: vi.fn((values: Record<string, unknown>) => {
      insertCalls.push(values)
      return Promise.resolve({ error: null })
    }),
  }))

  const client = { from } as unknown as SupabaseClient
  return { client, from, updateCalls, insertCalls }
}

describe('opstellingService.listForKwart', () => {
  it('rejects and never queries the database when there is no active session', async () => {
    const { client, from } = fakeClient([])
    const service = createOpstellingService(client, fakeAuth(null))

    await expect(service.listForKwart('w1', 1)).rejects.toThrow(/niet ingelogd/i)
    expect(from).not.toHaveBeenCalled()
  })

  it('returns a { positie: spelerId } map, one entry per placed row', async () => {
    const { client } = fakeClient([
      { id: 'o1', speler_id: 's1', positie: 'Keeper' },
      { id: 'o2', speler_id: 's2', positie: 'Linksback' },
    ])
    const service = createOpstellingService(client, fakeAuth(authedSession))

    await expect(service.listForKwart('w1', 1)).resolves.toEqual({
      Keeper: 's1',
      Linksback: 's2',
    })
  })

  it('surfaces a Postgres/RLS error instead of silently returning an empty map', async () => {
    const from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ data: null, error: new Error('permission denied for table opstelling') }),
        })),
      })),
    }))
    const client = { from } as unknown as SupabaseClient
    const service = createOpstellingService(client, fakeAuth(authedSession))

    await expect(service.listForKwart('w1', 1)).rejects.toThrow(/permission denied/)
  })
})

describe('opstellingService.placeSpeler', () => {
  it('rejects and never queries the database when there is no active session', async () => {
    const { client, from } = fakeClient([])
    const service = createOpstellingService(client, fakeAuth(null))

    await expect(service.placeSpeler('w1', 1, 'Keeper', 's1')).rejects.toThrow(/niet ingelogd/i)
    expect(from).not.toHaveBeenCalled()
  })

  it('inserts a new row when the positie is empty and the speler has no row yet this kwart', async () => {
    const { client, insertCalls, updateCalls } = fakeClient([])
    const service = createOpstellingService(client, fakeAuth(authedSession))

    await service.placeSpeler('w1', 1, 'Keeper', 's1')

    expect(insertCalls).toEqual([{ wedstrijd_id: 'w1', kwart: 1, speler_id: 's1', positie: 'Keeper' }])
    expect(updateCalls).toHaveLength(0)
  })

  it('moves the speler when they already have a row this kwart and the target positie is free', async () => {
    const rows = [{ id: 'o1', speler_id: 's1', positie: 'Linksback' }]
    const { client, updateCalls, insertCalls } = fakeClient(rows)
    const service = createOpstellingService(client, fakeAuth(authedSession))

    await service.placeSpeler('w1', 1, 'Keeper', 's1')

    expect(updateCalls).toEqual([{ id: 'o1', patch: { positie: 'Keeper' } }])
    expect(insertCalls).toHaveLength(0)
  })

  it('bumps the previous occupant back to the wisselbank when the speler comes from the bench', async () => {
    const rows = [{ id: 'o1', speler_id: 's-old', positie: 'Keeper' }]
    const { client, updateCalls } = fakeClient(rows)
    const service = createOpstellingService(client, fakeAuth(authedSession))

    await service.placeSpeler('w1', 1, 'Keeper', 's-new')

    // Single update: the existing row's occupant changes, no delete+insert.
    expect(updateCalls).toEqual([{ id: 'o1', patch: { speler_id: 's-new' } }])
  })

  it('swaps two players when both already occupy a positie this kwart', async () => {
    const rows = [
      { id: 'o1', speler_id: 's1', positie: 'Keeper' },
      { id: 'o2', speler_id: 's2', positie: 'Linksback' },
    ]
    const { client, updateCalls } = fakeClient(rows)
    const service = createOpstellingService(client, fakeAuth(authedSession))

    await service.placeSpeler('w1', 1, 'Linksback', 's1')

    // Displaced row moves to a temp value first, then the mover claims the
    // target, then the displaced row lands on the mover's old positie —
    // avoids ever violating the (wedstrijd_id, kwart, positie) constraint.
    expect(updateCalls).toEqual([
      { id: 'o2', patch: { positie: '__swap_o2' } },
      { id: 'o1', patch: { positie: 'Linksback' } },
      { id: 'o2', patch: { positie: 'Keeper' } },
    ])
    expect(rows.find((r) => r.id === 'o1')?.positie).toBe('Linksback')
    expect(rows.find((r) => r.id === 'o2')?.positie).toBe('Keeper')
  })

  it('does nothing when the speler is dropped back onto their own positie', async () => {
    const rows = [{ id: 'o1', speler_id: 's1', positie: 'Keeper' }]
    const { client, updateCalls, insertCalls } = fakeClient(rows)
    const service = createOpstellingService(client, fakeAuth(authedSession))

    await service.placeSpeler('w1', 1, 'Keeper', 's1')

    expect(updateCalls).toHaveLength(0)
    expect(insertCalls).toHaveLength(0)
  })

  it('surfaces a Postgres/RLS error from the initial read', async () => {
    const from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ data: null, error: new Error('permission denied for table opstelling') }),
        })),
      })),
    }))
    const client = { from } as unknown as SupabaseClient
    const service = createOpstellingService(client, fakeAuth(authedSession))

    await expect(service.placeSpeler('w1', 1, 'Keeper', 's1')).rejects.toThrow(/permission denied/)
  })
})
