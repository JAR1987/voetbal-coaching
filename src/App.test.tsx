import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session } from '@supabase/supabase-js'
import type { AuthService } from './data/authService'
import type { TeamService } from './data/teamService'
import type { SpelerService } from './data/spelerService'
import type { SeizoenService } from './data/seizoenService'
import type { WedstrijdService } from './data/wedstrijdService'
import type { AanwezigheidService } from './data/aanwezigheidService'
import type { OpstellingService } from './data/opstellingService'
import type { StatistiekenService } from './data/statistiekenService'
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

// Only needs to satisfy DashboardScreen's mount-time list() call for these
// App-level tests — seizoenService has its own dedicated tests
// (src/data/__tests__/seizoenService.test.ts).
function fakeSeizoenService(overrides: Partial<SeizoenService> = {}): SeizoenService {
  return {
    list: vi.fn().mockResolvedValue([]),
    getOrCreateSeasonForDate: vi.fn(),
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
    updateKwartDuur: vi.fn(),
    ...overrides,
  }
}

// Only needs to satisfy WedstrijdScreen/AanwezigheidScreen's own mount-time
// wiring for these App-level tests — the selectable-match UI has its own
// dedicated tests (see AanwezigheidScreen.test.tsx).
function fakeAanwezigheidService(overrides: Partial<AanwezigheidService> = {}): AanwezigheidService {
  return {
    listForMatch: vi.fn().mockResolvedValue([]),
    setStatus: vi.fn(),
    setFitheid: vi.fn(),
    ...overrides,
  }
}

// Only needs to satisfy HomeScreen/WedstrijdScreen's mount-time wiring for
// these App-level tests — opstellingService has its own dedicated tests
// (src/data/__tests__/opstellingService.test.ts).
function fakeOpstellingService(overrides: Partial<OpstellingService> = {}): OpstellingService {
  return {
    listForKwart: vi.fn().mockResolvedValue({}),
    placeSpeler: vi.fn(),
    cumulatieveSpeeltijdPerSpeler: vi.fn().mockResolvedValue({}),
    listBeoordelingenForKwart: vi.fn().mockResolvedValue({}),
    setBeoordeling: vi.fn(),
    ...overrides,
  }
}

// Only needs to satisfy DashboardScreen's mount-time wiring for these
// App-level tests — statistiekenService has its own dedicated tests
// (src/data/__tests__/statistiekenService.test.ts).
function fakeStatistiekenService(overrides: Partial<StatistiekenService> = {}): StatistiekenService {
  return {
    berekenVoorSeizoen: vi.fn().mockResolvedValue({ perSpeler: {}, teamOverzicht: { gemiddeldeSpeeltijd: 0, regels: [] } }),
    ...overrides,
  }
}

function renderApp(overrides: Partial<Parameters<typeof App>[0]> = {}) {
  return render(
    <App
      authService={fakeAuthService()}
      teamService={fakeTeamService()}
      spelerService={fakeSpelerService()}
      seizoenService={fakeSeizoenService()}
      wedstrijdService={fakeWedstrijdService()}
      aanwezigheidService={fakeAanwezigheidService()}
      opstellingService={fakeOpstellingService()}
      statistiekenService={fakeStatistiekenService()}
      {...overrides}
    />,
  )
}

describe('App', () => {
  // App uses a real BrowserRouter (no initialEntries override) in most of
  // these tests, so jsdom's own history — shared across tests in this file
  // — needs resetting each time.
  beforeEach(() => {
    window.history.pushState({}, '', '/')
  })

  it('shows the login screen, never the home screen, when logged out', async () => {
    renderApp()

    expect(await screen.findByRole('button', { name: /inloggen/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /uitloggen/i })).not.toBeInTheDocument()
  })

  it('shows the home screen (redirected to /wedstrijden) once a session is present', async () => {
    const session = { user: { id: 'coach-1' } } as unknown as Session
    renderApp({ authService: fakeAuthService({ getSession: vi.fn().mockResolvedValue(session) }) })

    expect(await screen.findByRole('button', { name: /uitloggen/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /inloggen/i })).not.toBeInTheDocument()
    // The Uitloggen button (always rendered once team-loading starts) can
    // appear before HomeScreen's own index-route redirect to /wedstrijden
    // has actually run — await it too rather than asserting synchronously.
    expect(await screen.findByRole('heading', { name: 'Wedstrijden' })).toBeInTheDocument()
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

    renderApp({ authService })
    expect(await screen.findByRole('button', { name: /inloggen/i })).toBeInTheDocument()

    emitSessionChange({ user: { id: 'coach-1' } } as unknown as Session)

    expect(await screen.findByRole('button', { name: /uitloggen/i })).toBeInTheDocument()
  })

  it('redirects a logged-out visit to any in-app URL back to /login', async () => {
    window.history.pushState({}, '', '/wedstrijden')
    renderApp()

    expect(await screen.findByRole('button', { name: /inloggen/i })).toBeInTheDocument()
  })

  it('redirects a logged-in visit to /login straight to /wedstrijden', async () => {
    window.history.pushState({}, '', '/login')
    const session = { user: { id: 'coach-1' } } as unknown as Session
    renderApp({ authService: fakeAuthService({ getSession: vi.fn().mockResolvedValue(session) }) })

    expect(await screen.findByRole('heading', { name: 'Wedstrijden' })).toBeInTheDocument()
  })

  it('keeps the build-info footer visible on both the login screen and the home screen', async () => {
    const { unmount } = renderApp()
    expect(await screen.findByText(/^v/)).toBeInTheDocument()
    unmount()

    const session = { user: { id: 'coach-1' } } as unknown as Session
    renderApp({ authService: fakeAuthService({ getSession: vi.fn().mockResolvedValue(session) }) })
    expect(await screen.findByText(/^v/)).toBeInTheDocument()
  })

  describe('browser back button', () => {
    afterEach(() => {
      window.history.pushState({}, '', '/')
    })

    it('goes back from Spelers to Wedstrijden using the real browser history', async () => {
      const user = userEvent.setup()
      const session = { user: { id: 'coach-1' } } as unknown as Session
      renderApp({ authService: fakeAuthService({ getSession: vi.fn().mockResolvedValue(session) }) })
      await screen.findByRole('heading', { name: 'Wedstrijden' })

      await user.click(screen.getByRole('link', { name: 'Spelers' }))
      expect(await screen.findByText('Nog geen spelers toegevoegd.')).toBeInTheDocument()

      window.history.back()

      await waitFor(() => expect(screen.getByText('Nog geen wedstrijden aangemaakt.')).toBeInTheDocument())
    })
  })
})
