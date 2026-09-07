import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Speler } from '../../data/types'
import type { SpelerService } from '../../data/spelerService'
import type { AanwezigheidService, SpelerAanwezigheid } from '../../data/aanwezigheidService'
import { AanwezigheidScreen } from '../AanwezigheidScreen'

const spelers: Speler[] = [
  {
    id: 's1',
    teamId: 'team-1',
    naam: 'Jan Jansen',
    rugnummer: 9,
    opmerkingen: null,
    status: 'actief',
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 's2',
    teamId: 'team-1',
    naam: 'Piet Peters',
    rugnummer: 5,
    opmerkingen: null,
    status: 'actief',
    createdAt: '2026-01-01T00:00:00Z',
  },
]

function fakeSpelerService(overrides: Partial<SpelerService> = {}): SpelerService {
  return {
    list: vi.fn().mockResolvedValue(spelers),
    create: vi.fn(),
    update: vi.fn(),
    setStatus: vi.fn(),
    ...overrides,
  }
}

/**
 * A tiny in-memory fake that mirrors the real service's "no row = aanwezig"
 * merge (see src/data/__tests__/aanwezigheidService.test.ts for that logic's
 * own dedicated coverage) — lets this component test drive the real
 * open-match/mark-afgemeld/set-fitheid flow through the UI.
 */
function createFakeAanwezigheidService(): AanwezigheidService {
  const rows = new Map<string, { status: 'aanwezig' | 'afgemeld'; fitheidStatus: string | null }>()

  return {
    listForMatch: vi.fn(async (_wedstrijdId: string, alleActievePlayers: Speler[]): Promise<SpelerAanwezigheid[]> =>
      alleActievePlayers.map((speler) => ({
        speler,
        status: rows.get(speler.id)?.status ?? 'aanwezig',
        fitheidStatus: (rows.get(speler.id)?.fitheidStatus as SpelerAanwezigheid['fitheidStatus']) ?? null,
      })),
    ),
    setStatus: vi.fn(async (_wedstrijdId: string, spelerId: string, status: 'aanwezig' | 'afgemeld') => {
      rows.set(spelerId, { status, fitheidStatus: rows.get(spelerId)?.fitheidStatus ?? null })
      return {
        id: 'a1',
        wedstrijdId: 'w1',
        spelerId,
        status,
        fitheidStatus: rows.get(spelerId)?.fitheidStatus ?? null,
        createdAt: '2026-01-01T00:00:00Z',
      }
    }),
    setFitheid: vi.fn(async (_wedstrijdId: string, spelerId: string, fitheidStatus: string | null) => {
      rows.set(spelerId, { status: rows.get(spelerId)?.status ?? 'aanwezig', fitheidStatus })
      return {
        id: 'a1',
        wedstrijdId: 'w1',
        spelerId,
        status: rows.get(spelerId)?.status ?? 'aanwezig',
        fitheidStatus,
        createdAt: '2026-01-01T00:00:00Z',
      }
    }),
  } as unknown as AanwezigheidService
}

describe('AanwezigheidScreen', () => {
  it('defaults all active players to aanwezig with no action needed', async () => {
    render(
      <AanwezigheidScreen
        aanwezigheidService={createFakeAanwezigheidService()}
        spelerService={fakeSpelerService()}
        wedstrijdId="w1"
        teamId="team-1"
      />,
    )

    expect(await screen.findByText('Jan Jansen')).toBeInTheDocument()
    expect(screen.getByText('Piet Peters')).toBeInTheDocument()
    const items = screen.getAllByText('Aanwezig')
    expect(items).toHaveLength(2)
    // Only active players are asked for — active-only is spelerService.list's default.
    expect(screen.queryByText('Afgemeld')).not.toBeInTheDocument()
  })

  it('marks a player afgemeld and removes their fitheid control', async () => {
    const user = userEvent.setup()
    const aanwezigheidService = createFakeAanwezigheidService()
    render(
      <AanwezigheidScreen
        aanwezigheidService={aanwezigheidService}
        spelerService={fakeSpelerService()}
        wedstrijdId="w1"
        teamId="team-1"
      />,
    )
    await screen.findByText('Jan Jansen')

    const janRow = screen.getByText('Jan Jansen').closest('li')!
    expect(within(janRow).getByLabelText(/fitheid voor jan jansen/i)).toBeInTheDocument()

    await user.click(within(janRow).getByRole('button', { name: /afmelden/i }))

    await waitFor(() => expect(within(janRow).getByText('Afgemeld')).toBeInTheDocument())
    expect(aanwezigheidService.setStatus).toHaveBeenCalledWith('w1', 's1', 'afgemeld')
    expect(within(janRow).queryByLabelText(/fitheid/i)).not.toBeInTheDocument()
    expect(within(janRow).getByRole('button', { name: /aanwezig melden/i })).toBeInTheDocument()
  })

  it('sets a fitheid status for an aanwezige player and reflects the chosen value', async () => {
    const user = userEvent.setup()
    const aanwezigheidService = createFakeAanwezigheidService()
    render(
      <AanwezigheidScreen
        aanwezigheidService={aanwezigheidService}
        spelerService={fakeSpelerService()}
        wedstrijdId="w1"
        teamId="team-1"
      />,
    )
    await screen.findByText('Piet Peters')

    const pietRow = screen.getByText('Piet Peters').closest('li')!
    await user.selectOptions(within(pietRow).getByLabelText(/fitheid voor piet peters/i), 'geblesseerd')

    await waitFor(() => expect(aanwezigheidService.setFitheid).toHaveBeenCalledWith('w1', 's2', 'geblesseerd'))
    expect(within(pietRow).getByLabelText(/fitheid voor piet peters/i)).toHaveValue('geblesseerd')
    // Still aanwezig — setting fitheid never changes attendance status.
    expect(within(pietRow).getByText('Aanwezig')).toBeInTheDocument()
  })

  it('shows a Dutch error message when attendance cannot be fetched', async () => {
    render(
      <AanwezigheidScreen
        aanwezigheidService={{
          listForMatch: vi.fn().mockRejectedValue(new Error('permission denied for table aanwezigheid')),
          setStatus: vi.fn(),
          setFitheid: vi.fn(),
        }}
        spelerService={fakeSpelerService()}
        wedstrijdId="w1"
        teamId="team-1"
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(/niet gelukt/i)
  })
})
