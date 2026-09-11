import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { FitheidStatus, Speler, Wedstrijd } from '../../data/types'
import { DEFAULT_FORMATIE } from '../../data/types'
import type { NewWedstrijdInput, WedstrijdService } from '../../data/wedstrijdService'
import type { SpelerService } from '../../data/spelerService'
import type { AanwezigheidService } from '../../data/aanwezigheidService'
import type { OpstellingService } from '../../data/opstellingService'
import { WedstrijdScreen } from '../WedstrijdScreen'

/**
 * A lightweight in-memory fake of WedstrijdService, backed by a map instead
 * of Supabase/seizoenService — lets these tests drive the real
 * create-a-match-and-see-it-appear flow through the UI without asserting on
 * individual mock call plumbing (that's what
 * src/data/__tests__/wedstrijdService.test.ts already covers). Mirrors the
 * behaviour of the real service (defaulting formatie per formaat) closely
 * enough for that purpose without needing a real season.
 */
function createFakeWedstrijdService(): WedstrijdService {
  const byTeam = new Map<string, Wedstrijd[]>()
  let nextId = 1

  return {
    list: vi.fn(async (teamId: string) => byTeam.get(teamId) ?? []),
    create: vi.fn(async (input: NewWedstrijdInput) => {
      const wedstrijd: Wedstrijd = {
        id: `w${nextId++}`,
        seizoenId: 'seizoen-fake',
        datum: input.datum,
        formaat: input.formaat,
        formatie: input.formatie ?? DEFAULT_FORMATIE[input.formaat],
        tegenstander: input.tegenstander ?? null,
        eigenScore: input.eigenScore ?? null,
        tegenScore: input.tegenScore ?? null,
        thuisUit: input.thuisUit ?? null,
        kwartDuurSeconden: 1200,
        createdAt: '2026-01-01T00:00:00Z',
      }
      byTeam.set(input.teamId, [...(byTeam.get(input.teamId) ?? []), wedstrijd])
      return wedstrijd
    }),
    updateKwartDuur: vi.fn(),
    updateWedstrijdgegevens: vi.fn(),
  }
}

// Only needs to satisfy MatchDetailScreen/AanwezigheidScreen's own
// mount-time wiring for these WedstrijdScreen-level tests that don't select
// a match — the selectable-match/detail flow itself is covered by the
// "selecting a match" describe block below, and the merge/default logic has
// its own dedicated tests (src/data/__tests__/aanwezigheidService.test.ts,
// src/components/__tests__/AanwezigheidScreen.test.tsx).
function fakeSpelerService(overrides: Partial<SpelerService> = {}): SpelerService {
  return {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    setStatus: vi.fn(),
    ...overrides,
  }
}

function fakeAanwezigheidService(overrides: Partial<AanwezigheidService> = {}): AanwezigheidService {
  return {
    listForMatch: vi.fn().mockResolvedValue([]),
    setStatus: vi.fn(),
    setFitheid: vi.fn(),
    ...overrides,
  }
}

// Only needs to satisfy MatchDetailScreen/OpstellingScreen's mount-time
// wiring here — the plaatsen/slepen flow has its own dedicated tests
// (src/data/__tests__/opstellingService.test.ts and its component test).
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

interface RenderWedstrijdScreenOptions {
  wedstrijdService?: WedstrijdService
  spelerService?: SpelerService
  aanwezigheidService?: AanwezigheidService
  opstellingService?: OpstellingService
  initialEntries?: string[]
}

/** `WedstrijdScreen` owns its own routes (index/nieuw/:id) — mount it under a `*` route, like it's mounted at `/wedstrijden/*` in the real app, so relative `Link`s inside it resolve correctly. */
function renderWedstrijdScreen({
  wedstrijdService = createFakeWedstrijdService(),
  spelerService = fakeSpelerService(),
  aanwezigheidService = fakeAanwezigheidService(),
  opstellingService = fakeOpstellingService(),
  initialEntries = ['/wedstrijden'],
}: RenderWedstrijdScreenOptions = {}) {
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route
          path="/wedstrijden/*"
          element={
            <WedstrijdScreen
              wedstrijdService={wedstrijdService}
              spelerService={spelerService}
              aanwezigheidService={aanwezigheidService}
              opstellingService={opstellingService}
              teamId="team-1"
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  )
  return { wedstrijdService, spelerService, aanwezigheidService, opstellingService }
}

describe('WedstrijdScreen — list (/wedstrijden)', () => {
  it('shows only the list — no creation form on this screen — and a "+" link to the new-match screen', async () => {
    renderWedstrijdScreen()
    await screen.findByText(/nog geen wedstrijden/i)

    expect(screen.queryByRole('form', { name: /nieuwe wedstrijd aanmaken/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /nieuwe wedstrijd/i })).toHaveAttribute('href', '/wedstrijden/nieuw')
  })
})

describe('WedstrijdScreen — new match (/wedstrijden/nieuw)', () => {
  it('offers 1-3-3-1 (preselected) and 1-2-3-2 for 8-tegen-8, the default formaat', async () => {
    const user = userEvent.setup()
    renderWedstrijdScreen()
    await screen.findByText(/nog geen wedstrijden/i)
    await user.click(screen.getByRole('link', { name: /nieuwe wedstrijd/i }))

    const formatieSelect = await screen.findByLabelText('Formatie') as HTMLSelectElement
    const options = Array.from(formatieSelect.options).map((option) => option.value)

    expect(options).toEqual(['1-3-3-1', '1-2-3-2'])
    expect(formatieSelect.value).toBe('1-3-3-1')
  })

  it('switches the formatie options to 1-4-3-3 (preselected) and 1-4-4-2 when 11-tegen-11 is picked', async () => {
    const user = userEvent.setup()
    renderWedstrijdScreen({ initialEntries: ['/wedstrijden/nieuw'] })

    await user.selectOptions(await screen.findByLabelText('Formaat'), '11v11')

    const formatieSelect = screen.getByLabelText('Formatie') as HTMLSelectElement
    const options = Array.from(formatieSelect.options).map((option) => option.value)

    expect(options).toEqual(['1-4-3-3', '1-4-4-2'])
    expect(formatieSelect.value).toBe('1-4-3-3')
  })

  it('creates a match with only date + format filled in, and returns to the list showing it', async () => {
    const user = userEvent.setup()
    const { wedstrijdService } = renderWedstrijdScreen({ initialEntries: ['/wedstrijden/nieuw'] })

    fireEvent.change(await screen.findByLabelText('Datum'), { target: { value: '2026-09-20' } })
    await user.click(screen.getByRole('button', { name: /wedstrijd aanmaken/i }))

    // Back on the list screen (own URL, not inline under the form). A longer
    // timeout: react-router wraps the post-submit navigate() in its own
    // transition, on top of the create+refetch awaits already in flight.
    expect(await screen.findByText(/2026-09-20/, {}, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByRole('listitem')).toHaveTextContent('2026-09-20 — 8-tegen-8 — 1-3-3-1')
    expect(wedstrijdService.create).toHaveBeenCalledWith({
      teamId: 'team-1',
      datum: '2026-09-20',
      formaat: '8v8',
      formatie: '1-3-3-1',
    })
  })

  it('creates an 11-tegen-11 match with the alternative formation', async () => {
    const user = userEvent.setup()
    const { wedstrijdService } = renderWedstrijdScreen({ initialEntries: ['/wedstrijden/nieuw'] })

    fireEvent.change(await screen.findByLabelText('Datum'), { target: { value: '2026-03-14' } })
    await user.selectOptions(screen.getByLabelText('Formaat'), '11v11')
    await user.selectOptions(screen.getByLabelText('Formatie'), '1-4-4-2')
    await user.click(screen.getByRole('button', { name: /wedstrijd aanmaken/i }))

    // Scoped to a listitem, not findByText(/1-4-4-2/): that regex also
    // matches the still-mounted Formatie <option value="1-4-4-2">, so a bare
    // text search can resolve to that stale option instead of the list row.
    expect(await screen.findByRole('listitem', {}, { timeout: 5000 })).toHaveTextContent('1-4-4-2')
    expect(wedstrijdService.create).toHaveBeenCalledWith({
      teamId: 'team-1',
      datum: '2026-03-14',
      formaat: '11v11',
      formatie: '1-4-4-2',
    })
  })

  it('requires a date (enforced by the form)', async () => {
    renderWedstrijdScreen({ initialEntries: ['/wedstrijden/nieuw'] })

    expect(await screen.findByLabelText('Datum')).toBeRequired()
  })
})

describe('WedstrijdScreen — list toont wedstrijdgegevens indien ingevuld (jt-dvh.14.10)', () => {
  const zonderGegevens: Wedstrijd = {
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

  it('toont niets extra wanneer tegenstander/uitslag nog niet zijn ingevuld', async () => {
    renderWedstrijdScreen({
      wedstrijdService: {
        list: vi.fn().mockResolvedValue([zonderGegevens]),
        create: vi.fn(),
        updateKwartDuur: vi.fn(),
        updateWedstrijdgegevens: vi.fn(),
      },
    })

    expect(await screen.findByRole('link', { name: '2026-09-20 — 8-tegen-8 — 1-3-3-1' })).toBeInTheDocument()
  })

  it('toont tegenstander, thuis/uit en uitslag wanneer ingevuld', async () => {
    const gevuld: Wedstrijd = {
      ...zonderGegevens,
      id: 'w2',
      tegenstander: 'FC Voorbeeld',
      eigenScore: 3,
      tegenScore: 1,
      thuisUit: 'thuis',
    }
    renderWedstrijdScreen({
      wedstrijdService: {
        list: vi.fn().mockResolvedValue([gevuld]),
        create: vi.fn(),
        updateKwartDuur: vi.fn(),
        updateWedstrijdgegevens: vi.fn(),
      },
    })

    expect(
      await screen.findByRole('link', { name: '2026-09-20 — 8-tegen-8 — 1-3-3-1 — vs FC Voorbeeld, thuis, 3-1' }),
    ).toBeInTheDocument()
  })
})

describe('WedstrijdScreen — selecting a match', () => {
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

  const bestaandeWedstrijd: Wedstrijd = {
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

  it('navigates to the match-detail screen (its own URL) when a match row is clicked, and back to the list via the back link', async () => {
    const user = userEvent.setup()
    const wedstrijdService: WedstrijdService = {
      list: vi.fn().mockResolvedValue([bestaandeWedstrijd]),
      create: vi.fn(),
      updateKwartDuur: vi.fn(),
      updateWedstrijdgegevens: vi.fn(),
    }
    renderWedstrijdScreen({
      wedstrijdService,
      spelerService: fakeSpelerService({ list: vi.fn().mockResolvedValue(spelers) }),
    })

    const matchRow = await screen.findByRole('link', { name: /2026-09-20 — 8-tegen-8 — 1-3-3-1/ })
    expect(screen.queryByText('Aanwezigheid')).not.toBeInTheDocument()

    await user.click(matchRow)
    expect(await screen.findByRole('link', { name: 'Aanwezigheid' })).toBeInTheDocument()
    // Opstelling is the default/landing sub-tab.
    expect(screen.getByRole('link', { name: 'Opstelling' })).toHaveClass('actief')

    await user.click(screen.getByRole('link', { name: /terug naar wedstrijden/i }))
    expect(await screen.findByText(/nog geen wedstrijden|2026-09-20/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Aanwezigheid' })).not.toBeInTheDocument()
  })

  it('defaults every active player to aanwezig, lets the coach mark one afgemeld and set a fitheid status, and reflects both', async () => {
    const user = userEvent.setup()
    const wedstrijdService: WedstrijdService = {
      list: vi.fn().mockResolvedValue([bestaandeWedstrijd]),
      create: vi.fn(),
      updateKwartDuur: vi.fn(),
      updateWedstrijdgegevens: vi.fn(),
    }

    // A small in-memory fake, like the other component tests use — real
    // "no row = aanwezig" merge logic already covered by
    // src/data/__tests__/aanwezigheidService.test.ts.
    const rows = new Map<string, { status: 'aanwezig' | 'afgemeld'; fitheidStatus: FitheidStatus | null }>()
    const aanwezigheidService: AanwezigheidService = {
      listForMatch: vi.fn(async (_wedstrijdId: string, alleActievePlayers: Speler[]) =>
        alleActievePlayers.map((speler) => ({
          speler,
          status: rows.get(speler.id)?.status ?? 'aanwezig',
          fitheidStatus: rows.get(speler.id)?.fitheidStatus ?? null,
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
      setFitheid: vi.fn(async (_wedstrijdId: string, spelerId: string, fitheidStatus: FitheidStatus | null) => {
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
    }

    renderWedstrijdScreen({
      wedstrijdService,
      spelerService: fakeSpelerService({ list: vi.fn().mockResolvedValue(spelers) }),
      aanwezigheidService,
    })

    await user.click(await screen.findByRole('link', { name: /2026-09-20 — 8-tegen-8 — 1-3-3-1/ }))
    await user.click(await screen.findByRole('link', { name: 'Aanwezigheid' }))
    await screen.findByText('Jan Jansen')
    // Scoped to AanwezigheidScreen: OpstellingScreen's wisselbank (a sibling
    // sub-tab) shows the same player names in its own bench buttons.
    const aanwezigheid = within(screen.getByText('Jan Jansen').closest('section')!)

    // Both active players default to aanwezig with no action needed.
    const janRow = aanwezigheid.getByText('Jan Jansen').closest('li')!
    const pietRow = aanwezigheid.getByText('Piet Peters').closest('li')!
    expect(janRow).toHaveTextContent('Aanwezig')
    expect(pietRow).toHaveTextContent('Aanwezig')

    // Mark Jan afgemeld.
    await user.click(within(janRow).getByRole('button', { name: /afmelden/i }))
    await waitFor(() => expect(within(janRow).getByText('Afgemeld')).toBeInTheDocument())
    expect(aanwezigheidService.setStatus).toHaveBeenCalledWith('w1', 's1', 'afgemeld')
    // An afgemeld player no longer gets a fitheid control.
    expect(within(janRow).queryByLabelText(/fitheid/i)).not.toBeInTheDocument()

    // Set a fitheid status for Piet, who's still aanwezig.
    await user.selectOptions(within(pietRow).getByLabelText(/fitheid voor piet peters/i), 'let_op')
    await waitFor(() => expect(aanwezigheidService.setFitheid).toHaveBeenCalledWith('w1', 's2', 'let_op'))
    expect(within(pietRow).getByLabelText(/fitheid voor piet peters/i)).toHaveValue('let_op')
  })
})
