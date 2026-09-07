import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import type { AuthService } from './data/authService'
import type { TeamService } from './data/teamService'
import type { SpelerService } from './data/spelerService'
import type { WedstrijdService } from './data/wedstrijdService'
import type { AanwezigheidService } from './data/aanwezigheidService'
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

// Team/speler fakes below only need to satisfy HomeScreen's get-or-create-team
// + player-list wiring for these App-level tests — PlayerListScreen and
// teamService/spelerService each have their own dedicated tests.
function fakeTeamService(overrides: Partial<TeamService> = {}): TeamService {
  return {
    getMyTeams: vi.fn().mockResolvedValue([]),
    getOrCreateMyTeam: vi.fn().mockResolvedValue({
      id: 'team-1',
      coachUserId: 'coach-1',
      naam: 'Testteam',
      createdAt: '2026-01-01T00:00:00Z',
    }),
    ...overrides,
  }
}

function fakeSpelerService(overrides: Partial<SpelerService> = {}): SpelerService {
  return {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    setStatus: vi.fn(),
    ...overrides,
  }
}

// Only needs to satisfy WedstrijdScreen's own mount-time list() call for
// these App-level tests — WedstrijdScreen and wedstrijdService each have
// their own dedicated tests.
function fakeWedstrijdService(overrides: Partial<WedstrijdService> = {}): WedstrijdService {
  return {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    ...overrides,
  }
}

// Only needs to satisfy WedstrijdScreen/AanwezigheidScreen's own mount-time
// wiring for these App-level tests — aanwezigheidService and the new
// selectable-match UI each have their own dedicated tests
// (src/data/__tests__/aanwezigheidService.test.ts,
// src/components/__tests__/AanwezigheidScreen.test.tsx).
function fakeAanwezigheidService(overrides: Partial<AanwezigheidService> = {}): AanwezigheidService {
  return {
    listForMatch: vi.fn().mockResolvedValue([]),
    setStatus: vi.fn(),
    setFitheid: vi.fn(),
    ...overrides,
  }
}

describe('App', () => {
  it('shows the login screen, never the home screen, when logged out', async () => {
    render(
      <App
        authService={fakeAuthService()}
        teamService={fakeTeamService()}
        spelerService={fakeSpelerService()}
        wedstrijdService={fakeWedstrijdService()}
        aanwezigheidService={fakeAanwezigheidService()}
      />,
    )

    expect(await screen.findByRole('button', { name: /inloggen/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /uitloggen/i })).not.toBeInTheDocument()
  })

  it('shows the home screen once a session is present', async () => {
    const session = { user: { id: 'coach-1' } } as unknown as Session
    render(
      <App
        authService={fakeAuthService({ getSession: vi.fn().mockResolvedValue(session) })}
        teamService={fakeTeamService()}
        spelerService={fakeSpelerService()}
        wedstrijdService={fakeWedstrijdService()}
        aanwezigheidService={fakeAanwezigheidService()}
      />,
    )

    expect(await screen.findByRole('button', { name: /uitloggen/i })).toBeInTheDocument()
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

    render(
      <App
        authService={authService}
        teamService={fakeTeamService()}
        spelerService={fakeSpelerService()}
        wedstrijdService={fakeWedstrijdService()}
        aanwezigheidService={fakeAanwezigheidService()}
      />,
    )
    expect(await screen.findByRole('button', { name: /inloggen/i })).toBeInTheDocument()

    emitSessionChange({ user: { id: 'coach-1' } } as unknown as Session)

    expect(await screen.findByRole('button', { name: /uitloggen/i })).toBeInTheDocument()
  })
})
