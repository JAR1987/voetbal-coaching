import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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

describe('HomeScreen', () => {
  it('fetches-or-creates the coach team and renders the player list for it', async () => {
    const teamService: TeamService = {
      getMyTeams: vi.fn(),
      getOrCreateMyTeam: vi.fn().mockResolvedValue({
        id: 'team-9',
        coachUserId: 'coach-1',
        naam: 'Testteam',
        createdAt: '2026-01-01T00:00:00Z',
      }),
    }
    const spelerService = fakeSpelerService()
    const wedstrijdService = fakeWedstrijdService()

    render(
      <HomeScreen
        authService={fakeAuthService()}
        teamService={teamService}
        spelerService={spelerService}
        wedstrijdService={wedstrijdService}
        aanwezigheidService={fakeAanwezigheidService()}
        opstellingService={fakeOpstellingService()}
      />,
    )

    expect(await screen.findByText('Spelers')).toBeInTheDocument()
    expect(teamService.getOrCreateMyTeam).toHaveBeenCalled()
    expect(spelerService.list).toHaveBeenCalledWith('team-9', { includeInactive: false })
    expect(await screen.findByText('Wedstrijden')).toBeInTheDocument()
    expect(wedstrijdService.list).toHaveBeenCalledWith('team-9')
  })

  it('shows a Dutch error message when the team cannot be fetched or created', async () => {
    const teamService: TeamService = {
      getMyTeams: vi.fn(),
      getOrCreateMyTeam: vi.fn().mockRejectedValue(new Error('permission denied for table team')),
    }

    render(
      <HomeScreen
        authService={fakeAuthService()}
        teamService={teamService}
        spelerService={fakeSpelerService()}
        wedstrijdService={fakeWedstrijdService()}
        aanwezigheidService={fakeAanwezigheidService()}
        opstellingService={fakeOpstellingService()}
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(/niet gelukt/i)
  })
})
