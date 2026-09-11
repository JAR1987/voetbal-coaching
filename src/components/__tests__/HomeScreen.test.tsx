import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { AuthService } from '../../data/authService'
import type { TeamService } from '../../data/teamService'
import type { SpelerService } from '../../data/spelerService'
import type { WedstrijdService } from '../../data/wedstrijdService'
import type { AanwezigheidService } from '../../data/aanwezigheidService'
import type { OpstellingService } from '../../data/opstellingService'
import { HomeScreen } from '../HomeScreen'

function fakeAuthService(): AuthService {
  return {
    signIn: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn().mockResolvedValue(null),
    onAuthStateChange: vi.fn(() => () => {}),
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
// these HomeScreen-level tests — WedstrijdScreen has its own dedicated
// tests (src/components/__tests__/WedstrijdScreen.test.tsx).
function fakeWedstrijdService(overrides: Partial<WedstrijdService> = {}): WedstrijdService {
  return {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    updateKwartDuur: vi.fn(),
    updateWedstrijdgegevens: vi.fn(),
    ...overrides,
  }
}

// Only needs to satisfy WedstrijdScreen's mount-time wiring for these
// HomeScreen-level tests — aanwezigheidService and the selectable-match UI
// each have their own dedicated tests
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

// Only needs to satisfy WedstrijdScreen/OpstellingScreen's mount-time wiring
// for these HomeScreen-level tests — opstellingService has its own dedicated
// tests (src/data/__tests__/opstellingService.test.ts).
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

interface RenderHomeScreenOptions {
  teamService: TeamService
  spelerService?: SpelerService
  wedstrijdService?: WedstrijdService
  initialEntries?: string[]
}

function renderHomeScreen({
  teamService,
  spelerService = fakeSpelerService(),
  wedstrijdService = fakeWedstrijdService(),
  initialEntries = ['/'],
}: RenderHomeScreenOptions) {
  const authService = fakeAuthService()
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <HomeScreen
        authService={authService}
        teamService={teamService}
        spelerService={spelerService}
        wedstrijdService={wedstrijdService}
        aanwezigheidService={fakeAanwezigheidService()}
        opstellingService={fakeOpstellingService()}
      />
    </MemoryRouter>,
  )
  return { authService }
}

function fakeTeamService(): TeamService {
  return {
    getMyTeams: vi.fn(),
    getOrCreateMyTeam: vi.fn().mockResolvedValue({
      id: 'team-9',
      coachUserId: 'coach-1',
      naam: 'Testteam',
      createdAt: '2026-01-01T00:00:00Z',
    }),
  }
}

describe('HomeScreen', () => {
  it('redirects the bare "/" to /wedstrijden (the primary in-match workflow), not a stacked player+match list', async () => {
    const wedstrijdService = fakeWedstrijdService()
    renderHomeScreen({ teamService: fakeTeamService(), wedstrijdService })

    expect(await screen.findByRole('heading', { name: 'Wedstrijden' })).toBeInTheDocument()
    // Effect-vs-render race: the heading can commit slightly before the
    // mounted WedstrijdScreen's own data-fetch effect has run — wait for it
    // rather than asserting synchronously right after the findBy above.
    await waitFor(() => expect(wedstrijdService.list).toHaveBeenCalledWith('team-9'))
    // Player list is a separate screen now — not rendered alongside it.
    expect(screen.queryByRole('heading', { name: 'Spelers' })).not.toBeInTheDocument()
  })

  it('shows the fixed tab bar (Spelers / Wedstrijden) once the team resolves, and Spelers is its own screen', async () => {
    const spelerService = fakeSpelerService()
    renderHomeScreen({ teamService: fakeTeamService(), spelerService, initialEntries: ['/spelers'] })

    expect(await screen.findByRole('heading', { name: 'Spelers' })).toBeInTheDocument()
    await waitFor(() => expect(spelerService.list).toHaveBeenCalledWith('team-9', { includeInactive: false }))
    // Match list is a separate screen now — not rendered alongside it.
    expect(screen.queryByRole('heading', { name: 'Wedstrijden' })).not.toBeInTheDocument()

    expect(screen.getByRole('link', { name: 'Spelers' })).toHaveClass('actief')
    expect(screen.getByRole('link', { name: 'Wedstrijden' })).not.toHaveClass('actief')
  })

  it('navigates between Spelers and Wedstrijden via the tab bar', async () => {
    const user = userEvent.setup()
    renderHomeScreen({ teamService: fakeTeamService() })
    await screen.findByRole('heading', { name: 'Wedstrijden' })

    await user.click(screen.getByRole('link', { name: 'Spelers' }))
    expect(await screen.findByText('Nog geen spelers toegevoegd.')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Wedstrijden' }))
    expect(await screen.findByText('Nog geen wedstrijden aangemaakt.')).toBeInTheDocument()
  })

  it('shows a Dutch error message when the team cannot be fetched or created', async () => {
    const teamService: TeamService = {
      getMyTeams: vi.fn(),
      getOrCreateMyTeam: vi.fn().mockRejectedValue(new Error('permission denied for table team')),
    }

    renderHomeScreen({ teamService })

    expect(await screen.findByRole('alert')).toHaveTextContent(/niet gelukt/i)
  })

  it('always offers Uitloggen, even while the team is still loading', async () => {
    const authService = fakeAuthService()
    render(
      <MemoryRouter initialEntries={['/']}>
        <HomeScreen
          authService={authService}
          teamService={fakeTeamService()}
          spelerService={fakeSpelerService()}
          wedstrijdService={fakeWedstrijdService()}
          aanwezigheidService={fakeAanwezigheidService()}
          opstellingService={fakeOpstellingService()}
        />
      </MemoryRouter>,
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /uitloggen/i }))
    expect(authService.signOut).toHaveBeenCalled()
  })
})
