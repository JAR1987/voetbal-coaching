import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { AanwezigheidService, SpelerAanwezigheid } from '../../data/aanwezigheidService'
import type { OpstellingMap, OpstellingService } from '../../data/opstellingService'
import type { SpelerService } from '../../data/spelerService'
import type { Speler, Wedstrijd } from '../../data/types'
import type { WedstrijdService } from '../../data/wedstrijdService'
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
  kwartDuurSeconden: 1200,
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

function fakeWedstrijdService(): WedstrijdService {
  return {
    list: vi.fn().mockResolvedValue([wedstrijd]),
    create: vi.fn(),
    updateKwartDuur: vi.fn().mockResolvedValue(wedstrijd),
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
    listBeoordelingenForKwart: vi.fn().mockResolvedValue({}),
    setBeoordeling: vi.fn(),
  }
}

interface RenderOptions {
  initialEntries?: string[]
}

/** `MatchDetailScreen` owns its own sub-routes (opstelling/aanwezigheid) — mount it at the same `/wedstrijden/:wedstrijdId/*` shape it gets in the real app (see `WedstrijdScreen`), so its absolute tab links and nested `<Routes>` resolve exactly like they do there. */
function renderMatchDetailScreen({ initialEntries = ['/wedstrijden/w1'] }: RenderOptions = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route
          path="/wedstrijden/:wedstrijdId/*"
          element={
            <MatchDetailScreen
              wedstrijd={wedstrijd}
              teamId="team-1"
              spelerService={fakeSpelerService()}
              aanwezigheidService={fakeAanwezigheidService()}
              opstellingService={fakeOpstellingService()}
              wedstrijdService={fakeWedstrijdService()}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('MatchDetailScreen — sub-tab navigation', () => {
  it('redirects the bare match URL to the Opstelling sub-tab by default', async () => {
    renderMatchDetailScreen()

    expect(await screen.findByRole('link', { name: 'Opstelling' })).toHaveClass('actief')
    expect(screen.getByRole('link', { name: 'Aanwezigheid' })).not.toHaveClass('actief')
    // Opstelling's own content (kwart-tabs) is visible on the landing tab.
    expect(await screen.findByRole('tab', { name: 'K1' })).toBeInTheDocument()
  })

  it('shows a back link to the match list', async () => {
    renderMatchDetailScreen()

    expect(await screen.findByRole('link', { name: /terug naar wedstrijden/i })).toHaveAttribute('href', '/wedstrijden')
  })

  it('switches to the Aanwezigheid sub-tab and back, without losing Opstelling state (still K1)', async () => {
    const user = userEvent.setup()
    renderMatchDetailScreen()
    await screen.findByRole('tab', { name: 'K1' })

    await user.click(screen.getByRole('link', { name: 'Aanwezigheid' }))
    expect(await screen.findByText('Jan Jansen')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'K1' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Opstelling' }))
    expect(await screen.findByRole('tab', { name: 'K1' })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('MatchDetailScreen — kwart-switcher (jt-dvh.14.6)', () => {
  it('toont K1 t/m K4, met K1 actief bij openen', async () => {
    renderMatchDetailScreen()

    expect(await screen.findByRole('tab', { name: 'K1' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'K2' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: 'K3' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'K4' })).toBeInTheDocument()
  })

  it('wisselt naar het gekozen kwart en toont diens eigen, onafhankelijke opstelling', async () => {
    const user = userEvent.setup()
    renderMatchDetailScreen()
    await screen.findByRole('button', { name: 'Keeper: Jan Jansen' })

    await user.click(screen.getByRole('tab', { name: 'K2' }))

    expect(await screen.findByRole('button', { name: 'Keeper: Piet Peters' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'K2' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'K1' })).toHaveAttribute('aria-selected', 'false')
  })
})
