import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import type { AuthService } from './data/authService'
import { App } from './App'

function fakeAuthService(overrides: Partial<AuthService> = {}): AuthService {
  return {
    signIn: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn().mockResolvedValue(null),
    onAuthStateChange: vi.fn(() => () => {}),
    ...overrides,
  }
}

describe('App', () => {
  it('shows the login screen, never the home screen, when logged out', async () => {
    render(<App authService={fakeAuthService()} />)

    expect(await screen.findByRole('button', { name: /inloggen/i })).toBeInTheDocument()
    expect(screen.queryByText(/je bent ingelogd/i)).not.toBeInTheDocument()
  })

  it('shows the home screen once a session is present', async () => {
    const session = { user: { id: 'coach-1' } } as unknown as Session
    render(<App authService={fakeAuthService({ getSession: vi.fn().mockResolvedValue(session) })} />)

    expect(await screen.findByText(/je bent ingelogd/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /inloggen/i })).not.toBeInTheDocument()
  })

  it('switches from login to home when a session is restored after a reload (onAuthStateChange)', async () => {
    let emitSessionChange: (session: Session | null) => void = () => {}
    const authService = fakeAuthService({
      getSession: vi.fn().mockResolvedValue(null),
      onAuthStateChange: vi.fn((callback: (session: Session | null) => void) => {
        emitSessionChange = callback
        return () => {}
      }),
    })

    render(<App authService={authService} />)
    expect(await screen.findByRole('button', { name: /inloggen/i })).toBeInTheDocument()

    emitSessionChange({ user: { id: 'coach-1' } } as unknown as Session)

    expect(await screen.findByText(/je bent ingelogd/i)).toBeInTheDocument()
  })
})
