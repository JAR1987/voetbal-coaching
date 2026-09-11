import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SeizoenService } from '../../data/seizoenService'
import type { SpelerService } from '../../data/spelerService'
import type { SeizoenStatistieken, StatistiekenService } from '../../data/statistiekenService'
import type { Seizoen, Speler } from '../../data/types'
import { DashboardScreen } from '../DashboardScreen'

function fakeSeizoenService(overrides: Partial<SeizoenService> = {}): SeizoenService {
  return {
    list: vi.fn().mockResolvedValue([]),
    getOrCreateSeasonForDate: vi.fn(),
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

function fakeStatistiekenService(overrides: Partial<StatistiekenService> = {}): StatistiekenService {
  return {
    berekenVoorSeizoen: vi.fn().mockResolvedValue(legeStatistieken()),
    ...overrides,
  }
}

function legeStatistieken(): SeizoenStatistieken {
  return { perSpeler: {}, teamOverzicht: { gemiddeldeSpeeltijd: 0, regels: [] } }
}

function seizoen(id: string, naam: string): Seizoen {
  return { id, teamId: 'team-1', naam, startDatum: null, eindDatum: null, createdAt: '2026-01-01T00:00:00Z' }
}

function speler(id: string, naam: string, opmerkingen: string | null = null): Speler {
  return { id, teamId: 'team-1', naam, rugnummer: null, opmerkingen, status: 'actief', createdAt: '2026-01-01T00:00:00Z' }
}

function renderDashboard(overrides: Partial<Parameters<typeof DashboardScreen>[0]> = {}) {
  return render(
    <DashboardScreen
      seizoenService={fakeSeizoenService()}
      spelerService={fakeSpelerService()}
      statistiekenService={fakeStatistiekenService()}
      teamId="team-1"
      {...overrides}
    />,
  )
}

describe('DashboardScreen', () => {
  it('shows a Dutch message when the team has no season yet', async () => {
    renderDashboard({ seizoenService: fakeSeizoenService({ list: vi.fn().mockResolvedValue([]) }) })

    expect(await screen.findByText('Nog geen seizoen aangemaakt.')).toBeInTheDocument()
  })

  it('shows a Dutch message when the team has no active spelers yet', async () => {
    renderDashboard({
      seizoenService: fakeSeizoenService({ list: vi.fn().mockResolvedValue([seizoen('sz1', '2025-2026')]) }),
      spelerService: fakeSpelerService({ list: vi.fn().mockResolvedValue([]) }),
    })

    expect(await screen.findByText('Nog geen actieve spelers.')).toBeInTheDocument()
  })

  it('defaults the season switcher to the most recent season', async () => {
    const berekenVoorSeizoen = vi.fn().mockResolvedValue(legeStatistieken())
    renderDashboard({
      seizoenService: fakeSeizoenService({
        list: vi.fn().mockResolvedValue([seizoen('sz-oud', '2023-2024'), seizoen('sz-nieuw', '2025-2026')]),
      }),
      spelerService: fakeSpelerService({ list: vi.fn().mockResolvedValue([speler('s1', 'Anna')]) }),
      statistiekenService: fakeStatistiekenService({ berekenVoorSeizoen }),
    })

    expect(await screen.findByRole('combobox', { name: 'Seizoen' })).toHaveValue('sz-nieuw')
    expect(berekenVoorSeizoen).toHaveBeenCalledWith('sz-nieuw', ['s1'])
  })

  it('shows per-speler totale speeltijd, wissel-count, and the two favoriete-posities as separate values', async () => {
    const resultaat: SeizoenStatistieken = {
      perSpeler: {
        s1: {
          spelerId: 's1',
          totaleSpeeltijd: 12,
          wisselCount: 3,
          meestGespeeldePositie: 'Keeper',
          bestBeoordeeldePositie: 'Spits',
          gemiddeldeScorePerPositie: { Keeper: 3.5, Spits: 4.2 },
        },
      },
      teamOverzicht: { gemiddeldeSpeeltijd: 12, regels: [{ spelerId: 's1', totaleSpeeltijd: 12, verschilTovGemiddelde: 0, wisselCount: 3 }] },
    }
    renderDashboard({
      seizoenService: fakeSeizoenService({ list: vi.fn().mockResolvedValue([seizoen('sz1', '2025-2026')]) }),
      spelerService: fakeSpelerService({ list: vi.fn().mockResolvedValue([speler('s1', 'Anna', 'Werkt aan afwerking')]) }),
      statistiekenService: fakeStatistiekenService({ berekenVoorSeizoen: vi.fn().mockResolvedValue(resultaat) }),
    })

    const profiel = await screen.findByRole('article', { name: 'Anna' })
    expect(within(profiel).getByText('12 kwarten')).toBeInTheDocument()
    expect(within(profiel).getByText('3')).toBeInTheDocument()
    expect(within(profiel).getByText('Keeper')).toBeInTheDocument()
    expect(within(profiel).getByText('Spits')).toBeInTheDocument()
    // "Meest gespeeld" en "best beoordeeld" zijn twee aparte velden, nooit gecombineerd.
    expect(within(profiel).getByText('Meest gespeelde positie').nextElementSibling).toHaveTextContent('Keeper')
    expect(within(profiel).getByText('Best beoordeelde positie').nextElementSibling).toHaveTextContent('Spits')
    expect(within(profiel).getByText('Keeper: 3.5')).toBeInTheDocument()
    expect(within(profiel).getByText('Spits: 4.2')).toBeInTheDocument()
    expect(within(profiel).getByText('Opmerkingen: Werkt aan afwerking')).toBeInTheDocument()
  })

  it('shows the team-wide speeltijd distribution in the team-overzicht', async () => {
    const resultaat: SeizoenStatistieken = {
      perSpeler: {
        s1: { spelerId: 's1', totaleSpeeltijd: 10, wisselCount: 2, meestGespeeldePositie: null, bestBeoordeeldePositie: null, gemiddeldeScorePerPositie: {} },
        s2: { spelerId: 's2', totaleSpeeltijd: 4, wisselCount: 8, meestGespeeldePositie: null, bestBeoordeeldePositie: null, gemiddeldeScorePerPositie: {} },
      },
      teamOverzicht: {
        gemiddeldeSpeeltijd: 7,
        regels: [
          { spelerId: 's1', totaleSpeeltijd: 10, verschilTovGemiddelde: 3, wisselCount: 2 },
          { spelerId: 's2', totaleSpeeltijd: 4, verschilTovGemiddelde: -3, wisselCount: 8 },
        ],
      },
    }
    renderDashboard({
      seizoenService: fakeSeizoenService({ list: vi.fn().mockResolvedValue([seizoen('sz1', '2025-2026')]) }),
      spelerService: fakeSpelerService({ list: vi.fn().mockResolvedValue([speler('s1', 'Anna'), speler('s2', 'Bram')]) }),
      statistiekenService: fakeStatistiekenService({ berekenVoorSeizoen: vi.fn().mockResolvedValue(resultaat) }),
    })

    const overzicht = await screen.findByRole('region', { name: /team-overzicht/i })
    const rijAnna = within(overzicht).getByText('Anna').closest('tr')!
    expect(within(rijAnna).getByText('+3')).toBeInTheDocument()
    const rijBram = within(overzicht).getByText('Bram').closest('tr')!
    expect(within(rijBram).getByText('-3')).toBeInTheDocument()
  })

  it('shows the selected season\'s own numbers when switching seasons, not the previous season relabeled', async () => {
    const user = userEvent.setup()
    const berekenVoorSeizoen = vi.fn().mockImplementation((seizoenId: string) => {
      if (seizoenId === 'sz-nieuw') {
        return Promise.resolve({
          perSpeler: {
            s1: { spelerId: 's1', totaleSpeeltijd: 20, wisselCount: 1, meestGespeeldePositie: 'Keeper', bestBeoordeeldePositie: 'Keeper', gemiddeldeScorePerPositie: {} },
          },
          teamOverzicht: { gemiddeldeSpeeltijd: 20, regels: [] },
        } satisfies SeizoenStatistieken)
      }
      return Promise.resolve({
        perSpeler: {
          s1: { spelerId: 's1', totaleSpeeltijd: 5, wisselCount: 7, meestGespeeldePositie: 'Spits', bestBeoordeeldePositie: 'Spits', gemiddeldeScorePerPositie: {} },
        },
        teamOverzicht: { gemiddeldeSpeeltijd: 5, regels: [] },
      } satisfies SeizoenStatistieken)
    })
    renderDashboard({
      seizoenService: fakeSeizoenService({
        list: vi.fn().mockResolvedValue([seizoen('sz-oud', '2023-2024'), seizoen('sz-nieuw', '2025-2026')]),
      }),
      spelerService: fakeSpelerService({ list: vi.fn().mockResolvedValue([speler('s1', 'Anna')]) }),
      statistiekenService: fakeStatistiekenService({ berekenVoorSeizoen }),
    })

    // Geen `within(profiel)` over de switch heen: het tussentijdse "Statistieken
    // laden…" ontkoppelt het oude article-element van de DOM.
    expect(await screen.findByText('20 kwarten')).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Seizoen' }), 'sz-oud')

    expect(await screen.findByText('5 kwarten')).toBeInTheDocument()
    expect(screen.queryByText('20 kwarten')).not.toBeInTheDocument()
    expect(berekenVoorSeizoen).toHaveBeenCalledWith('sz-oud', ['s1'])
  })

  it('shows a Dutch error message when seasons/spelers cannot be fetched', async () => {
    renderDashboard({ seizoenService: fakeSeizoenService({ list: vi.fn().mockRejectedValue(new Error('permission denied')) }) })

    expect(await screen.findByRole('alert')).toHaveTextContent(/niet gelukt/i)
  })
})
