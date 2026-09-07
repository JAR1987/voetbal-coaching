import { describe, expect, it, vi } from 'vitest'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { createAuthService } from '../authService'

function createFakeClient(overrides: {
  signInWithPassword?: ReturnType<typeof vi.fn>
  signOut?: ReturnType<typeof vi.fn>
  getSession?: ReturnType<typeof vi.fn>
  onAuthStateChange?: ReturnType<typeof vi.fn>
} = {}): SupabaseClient {
  const auth = {
    signInWithPassword: overrides.signInWithPassword ?? vi.fn(),
    signOut: overrides.signOut ?? vi.fn().mockResolvedValue({ error: null }),
    getSession: overrides.getSession ?? vi.fn(),
    onAuthStateChange:
      overrides.onAuthStateChange ??
      vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  }
  return { auth } as unknown as SupabaseClient
}

describe('authService.signIn', () => {
  it('returns the session on successful sign-in', async () => {
    const fakeSession = { user: { id: 'user-1' } } as unknown as Session
    const client = createFakeClient({
      signInWithPassword: vi
        .fn()
        .mockResolvedValue({ data: { session: fakeSession, user: fakeSession.user }, error: null }),
    })
    const service = createAuthService(client)

    const session = await service.signIn({ email: 'coach@example.com', password: 'geheim123' })

    expect(session).toBe(fakeSession)
  })

  it('rejects when Supabase returns an auth error (e.g. wrong password)', async () => {
    const client = createFakeClient({
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { session: null, user: null },
        error: new Error('Invalid login credentials'),
      }),
    })
    const service = createAuthService(client)

    await expect(
      service.signIn({ email: 'coach@example.com', password: 'fout-wachtwoord' }),
    ).rejects.toThrow('Invalid login credentials')
  })
})

describe('authService.getSession', () => {
  it('returns null when logged out', async () => {
    const client = createFakeClient({
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    })
    const service = createAuthService(client)

    await expect(service.getSession()).resolves.toBeNull()
  })

  it('returns the session when logged in', async () => {
    const fakeSession = { user: { id: 'user-1' } } as unknown as Session
    const client = createFakeClient({
      getSession: vi.fn().mockResolvedValue({ data: { session: fakeSession }, error: null }),
    })
    const service = createAuthService(client)

    await expect(service.getSession()).resolves.toBe(fakeSession)
  })
})

describe('authService.onAuthStateChange', () => {
  it('forwards the session from the underlying subscription and can unsubscribe', () => {
    const unsubscribe = vi.fn()
    const onAuthStateChange = vi.fn((_cb) => ({ data: { subscription: { unsubscribe } } }))
    const client = createFakeClient({ onAuthStateChange })
    const service = createAuthService(client)
    const callback = vi.fn()

    const unsub = service.onAuthStateChange(callback)
    const registeredCallback = onAuthStateChange.mock.calls[0][0]
    const fakeSession = { user: { id: 'user-1' } } as unknown as Session
    registeredCallback('SIGNED_IN', fakeSession)

    expect(callback).toHaveBeenCalledWith(fakeSession)

    unsub()
    expect(unsubscribe).toHaveBeenCalled()
  })
})
