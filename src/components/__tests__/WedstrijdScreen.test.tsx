import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
        createdAt: '2026-01-01T00:00:00Z',
      }
      byTeam.set(input.teamId, [...(byTeam.get(input.teamId) ?? []), wedstrijd])
      return wedstrijd
    }),
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
    ...overrides,
  }
}

describe('WedstrijdScreen', () => {
  it('offers 1-3-3-1 (preselected) and 1-2-3-2 for 8-tegen-8, the default formaat', async () => {
    render(
      <WedstrijdScreen
        wedstrijdService={createFakeWedstrijdService()}
        spelerService={fakeSpelerService()}
        aanwezigheidService={fakeAanwezigheidService()}
        opstellingService={fakeOpstellingService()}
        teamId="team-1"
      />,
    )
    await screen.findByText(/nog geen wedstrijden/i)

    const formatieSelect = screen.getByLabelText('Formatie') as HTMLSelectElement
    const options = Array.from(formatieSelect.options).map((option) => option.value)

    expect(options).toEqual(['1-3-3-1', '1-2-3-2'])
    expect(formatieSelect.value).toBe('1-3-3-1')
  })

  it('switches the formatie options to 1-4-3-3 (preselected) and 1-4-4-2 when 11-tegen-11 is picked', async () => {
    const user = userEvent.setup()
    render(
      <WedstrijdScreen
        wedstrijdService={createFakeWedstrijdService()}
        spelerService={fakeSpelerService()}
        aanwezigheidService={fakeAanwezigheidService()}
        opstellingService={fakeOpstellingService()}
        teamId="team-1"
      />,
    )
    await screen.findByText(/nog geen wedstrijden/i)

    await user.selectOptions(screen.getByLabelText('Formaat'), '11v11')

    const formatieSelect = screen.getByLabelText('Formatie') as HTMLSelectElement
    const options = Array.from(formatieSelect.options).map((option) => option.value)

    expect(options).toEqual(['1-4-3-3', '1-4-4-2'])
    expect(formatieSelect.value).toBe('1-4-3-3')
  })

  it('creates a match with only date + format filled in, and shows it in the list', async () => {
    const user = userEvent.setup()
    const wedstrijdService = createFakeWedstrijdService()
    render(
      <WedstrijdScreen
        wedstrijdService={wedstrijdService}
        spelerService={fakeSpelerService()}
        aanwezigheidService={fakeAanwezigheidService()}
        opstellingService={fakeOpstellingService()}
        teamId="team-1"
      />,
    )
    await screen.findByText(/nog geen wedstrijden/i)

    fireEvent.change(screen.getByLabelText('Datum'), { target: { value: '2026-09-20' } })
    await user.click(screen.getByRole('button', { name: /wedstrijd aanmaken/i }))

    expect(await screen.findByText(/2026-09-20/)).toBeInTheDocument()
    expect(screen.getByRole('listitem')).toHaveTextContent('2026-09-20 — 8-tegen-8 — 1-3-3-1')
    expect(wedstrijdService.create).toHaveBeenCalledWith({
      teamId: 'team-1',
      datum: '2026-09-20',
      formaat: '8v8',
      formatie: '1-3-3-1',
    })
  })

  it('creates an 11-tegen-11 match with the alternative formation and shows it in the list', async () => {
    const user = userEvent.setup()
    const wedstrijdService = createFakeWedstrijdService()
    render(
      <WedstrijdScreen
        wedstrijdService={wedstrijdService}
        spelerService={fakeSpelerService()}
        aanwezigheidService={fakeAanwezigheidService()}
        opstellingService={fakeOpstellingService()}
        teamId="team-1"
      />,
    )
    await screen.findByText(/nog geen wedstrijden/i)

    fireEvent.change(screen.getByLabelText('Datum'), { target: { value: '2026-03-14' } })
    await user.selectOptions(screen.getByLabelText('Formaat'), '11v11')
    await user.selectOptions(screen.getByLabelText('Formatie'), '1-4-4-2')
    await user.click(screen.getByRole('button', { name: /wedstrijd aanmaken/i }))

    expect(await screen.findByText(/1-4-4-2/)).toBeInTheDocument()
    expect(wedstrijdService.create).toHaveBeenCalledWith({
      teamId: 'team-1',
      datum: '2026-03-14',
      formaat: '11v11',
      formatie: '1-4-4-2',
    })
  })

  it('requires a date (enforced by the form)', async () => {
    render(
      <WedstrijdScreen
        wedstrijdService={createFakeWedstrijdService()}
        spelerService={fakeSpelerService()}
        aanwezigheidService={fakeAanwezigheidService()}
        opstellingService={fakeOpstellingService()}
        teamId="team-1"
      />,
    )
    await screen.findByText(/nog geen wedstrijden/i)

    expect(screen.getByLabelText('Datum')).toBeRequired()
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
    createdAt: '2026-01-01T00:00:00Z',
  }

  it('opens the match-detail view (attendance UI) when a match row is clicked, and closes it again when clicked once more', async () => {
    const user = userEvent.setup()
    const wedstrijdService: WedstrijdService = {
      list: vi.fn().mockResolvedValue([bestaandeWedstrijd]),
      create: vi.fn(),
    }
    render(
      <WedstrijdScreen
        wedstrijdService={wedstrijdService}
        spelerService={fakeSpelerService({ list: vi.fn().mockResolvedValue(spelers) })}
        aanwezigheidService={fakeAanwezigheidService()}
        opstellingService={fakeOpstellingService()}
        teamId="team-1"
      />,
    )

    const matchRow = await screen.findByRole('button', { name: /2026-09-20 — 8-tegen-8 — 1-3-3-1/ })
    expect(screen.queryByText('Aanwezigheid')).not.toBeInTheDocument()

    await user.click(matchRow)
    expect(await screen.findByText('Aanwezigheid')).toBeInTheDocument()

    await user.click(matchRow)
    expect(screen.queryByText('Aanwezigheid')).not.toBeInTheDocument()
  })

  it('defaults every active player to aanwezig, lets the coach mark one afgemeld and set a fitheid status, and reflects both', async () => {
    const user = userEvent.setup()
    const wedstrijdService: WedstrijdService = {
      list: vi.fn().mockResolvedValue([bestaandeWedstrijd]),
      create: vi.fn(),
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

    render(
      <WedstrijdScreen
        wedstrijdService={wedstrijdService}
        spelerService={fakeSpelerService({ list: vi.fn().mockResolvedValue(spelers) })}
        aanwezigheidService={aanwezigheidService}
        opstellingService={fakeOpstellingService()}
        teamId="team-1"
      />,
    )

    await user.click(await screen.findByRole('button', { name: /2026-09-20 — 8-tegen-8 — 1-3-3-1/ }))
    await screen.findByText('Aanwezigheid')
    // Scoped to AanwezigheidScreen: OpstellingScreen's wisselbank (a sibling
    // section) shows the same player names in its own bench buttons.
    const aanwezigheid = within(screen.getByText('Aanwezigheid').closest('section')!)

    // Both active players default to aanwezig with no action needed.
    const janRow = (await aanwezigheid.findByText('Jan Jansen')).closest('li')!
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
