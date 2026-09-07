import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { AuthService } from '../../data/authService'
import type { TeamService } from '../../data/teamService'
import type { SpelerService } from '../../data/spelerService'
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

    render(
      <HomeScreen authService={fakeAuthService()} teamService={teamService} spelerService={spelerService} />,
    )

    expect(await screen.findByText('Spelers')).toBeInTheDocument()
    expect(teamService.getOrCreateMyTeam).toHaveBeenCalled()
    expect(spelerService.list).toHaveBeenCalledWith('team-9', { includeInactive: false })
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
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(/niet gelukt/i)
  })
})
