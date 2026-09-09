import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AanwezigheidService, SpelerAanwezigheid } from '../../data/aanwezigheidService'
import type { OpstellingMap, OpstellingService } from '../../data/opstellingService'
import type { SpelerService } from '../../data/spelerService'
import type { Speler, Wedstrijd } from '../../data/types'
import { MatchDetailScreen } from '../MatchDetailScreen'

const spelers: Speler[] = [
  { id: 's1', teamId: 'team-1', naam: 'Jan Jansen', rugnummer: 9, opmerkingen: null, status: 'actief', createdAt: '2026-01-01T00:00:00Z' },
  { id: 's2', teamId: 'team-1', naam: 'Piet Peters', rugnummer: 5, opmerkingen: null, status: 'actief', createdAt: '2026-01-01T00:00:00Z' },
]

const wedstrijd: Wedstrijd = {
  id: 'w1',
  seizoenId: 'seizoen-1',
  datum: '2026-09-20',
  formaat: '8v8',
  formatie: '1-3-3-1',
  tegenstander: null,
  eigenScore: null,
  tegenScore: null,
  thuisUit: null,
  createdAt: '2026-01-01T00:00:00Z',
}

function fakeSpelerService(): SpelerService {
  return {
    list: vi.fn().mockResolvedValue(spelers),
    create: vi.fn(),
    update: vi.fn(),
    setStatus: vi.fn(),
  }
}

function fakeAanwezigheidService(): AanwezigheidService {
  return {
    listForMatch: vi.fn(async (_wedstrijdId: string, alleActievePlayers: Speler[]): Promise<SpelerAanwezigheid[]> =>
      alleActievePlayers.map((speler) => ({ speler, status: 'aanwezig', fitheidStatus: null })),
    ),
    setStatus: vi.fn(),
    setFitheid: vi.fn(),
  }
}

/** Kwart 1 en 2 komen hier al gevuld binnen zodat het jt-dvh.14.6
 * auto-voorstel niet meedoet — deze tests gaan alleen over de tabs zelf. */
function fakeOpstellingService(): OpstellingService {
  const perKwart: Record<number, OpstellingMap> = { 1: { Keeper: 's1' }, 2: { Keeper: 's2' } }
  return {
    listForKwart: vi.fn(async (_wedstrijdId: string, kwart: number) => ({ ...(perKwart[kwart] ?? {}) })),
    placeSpeler: vi.fn(),
    cumulatieveSpeeltijdPerSpeler: vi.fn().mockResolvedValue({}),
  }
}

describe('MatchDetailScreen — kwart-switcher (jt-dvh.14.6)', () => {
  it('toont K1 t/m K4, met K1 actief bij openen', async () => {
    render(
      <MatchDetailScreen
        wedstrijd={wedstrijd}
        teamId="team-1"
        spelerService={fakeSpelerService()}
        aanwezigheidService={fakeAanwezigheidService()}
        opstellingService={fakeOpstellingService()}
        onSluiten={vi.fn()}
      />,
    )

    expect(await screen.findByRole('tab', { name: 'K1' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'K2' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: 'K3' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'K4' })).toBeInTheDocument()
  })

  it('wisselt naar het gekozen kwart en toont diens eigen, onafhankelijke opstelling', async () => {
    const user = userEvent.setup()
    render(
      <MatchDetailScreen
        wedstrijd={wedstrijd}
        teamId="team-1"
        spelerService={fakeSpelerService()}
        aanwezigheidService={fakeAanwezigheidService()}
        opstellingService={fakeOpstellingService()}
        onSluiten={vi.fn()}
      />,
    )
    await screen.findByRole('button', { name: 'Keeper: Jan Jansen' })

    await user.click(screen.getByRole('tab', { name: 'K2' }))

    expect(await screen.findByRole('button', { name: 'Keeper: Piet Peters' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'K2' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'K1' })).toHaveAttribute('aria-selected', 'false')
  })
})
