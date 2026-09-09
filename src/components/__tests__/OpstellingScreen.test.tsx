import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AanwezigheidService, SpelerAanwezigheid } from '../../data/aanwezigheidService'
import type { OpstellingMap, OpstellingService } from '../../data/opstellingService'
import type { SpelerService } from '../../data/spelerService'
import type { Speler, Wedstrijd } from '../../data/types'
import { OpstellingScreen } from '../OpstellingScreen'

const spelers: Speler[] = [
  { id: 's1', teamId: 'team-1', naam: 'Jan Jansen', rugnummer: 9, opmerkingen: null, status: 'actief', createdAt: '2026-01-01T00:00:00Z' },
  { id: 's2', teamId: 'team-1', naam: 'Piet Peters', rugnummer: 5, opmerkingen: null, status: 'actief', createdAt: '2026-01-01T00:00:00Z' },
  { id: 's3', teamId: 'team-1', naam: 'Noor Noten', rugnummer: 3, opmerkingen: null, status: 'actief', createdAt: '2026-01-01T00:00:00Z' },
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

function fakeSpelerService(overrides: Partial<SpelerService> = {}): SpelerService {
  return {
    list: vi.fn().mockResolvedValue(spelers),
    create: vi.fn(),
    update: vi.fn(),
    setStatus: vi.fn(),
    ...overrides,
  }
}

/** Fixed attendance: everyone aanwezig except the ids listed in `afgemeld`. */
function fakeAanwezigheidService(afgemeld: string[] = []): AanwezigheidService {
  return {
    listForMatch: vi.fn(async (_wedstrijdId: string, alleActievePlayers: Speler[]): Promise<SpelerAanwezigheid[]> =>
      alleActievePlayers.map((speler) => ({
        speler,
        status: afgemeld.includes(speler.id) ? 'afgemeld' : 'aanwezig',
        fitheidStatus: null,
      })),
    ),
    setStatus: vi.fn(),
    setFitheid: vi.fn(),
  }
}

/** In-memory fake mirroring the real service's derivation (own coverage:
 * opstellingService.test.ts) — lets this test drive real tap/drag-to-place
 * flows through the UI. */
function createFakeOpstellingService(initial: Record<number, OpstellingMap> = {}): OpstellingService {
  const perKwart = new Map<number, OpstellingMap>(Object.entries(initial).map(([k, v]) => [Number(k), { ...v }]))

  return {
    listForKwart: vi.fn(async (_wedstrijdId: string, kwart: number) => ({ ...(perKwart.get(kwart) ?? {}) })),
    placeSpeler: vi.fn(async (_wedstrijdId: string, kwart: number, positie: string, spelerId: string) => {
      const map = { ...(perKwart.get(kwart) ?? {}) }
      const oudePositie = Object.keys(map).find((p) => map[p] === spelerId)
      const bezetDoor = map[positie]
      if (oudePositie) delete map[oudePositie]
      if (bezetDoor && bezetDoor !== spelerId && oudePositie) {
        map[oudePositie] = bezetDoor
      }
      map[positie] = spelerId
      perKwart.set(kwart, map)
    }),
  }
}

/** A tiny store-backed DataTransfer stand-in — jsdom has no real drag/drop,
 * but fireEvent lets a test supply the same object across dragStart/drop. */
function createDataTransfer() {
  const store: Record<string, string> = {}
  return {
    setData: (format: string, value: string) => {
      store[format] = value
    },
    getData: (format: string) => store[format] ?? '',
    effectAllowed: 'move',
  }
}

describe('OpstellingScreen', () => {
  it('shows every aanwezige speler on the wisselbank and empty pitch slots when nothing is placed yet', async () => {
    render(
      <OpstellingScreen
        opstellingService={createFakeOpstellingService()}
        aanwezigheidService={fakeAanwezigheidService()}
        spelerService={fakeSpelerService()}
        wedstrijd={wedstrijd}
        teamId="team-1"
      />,
    )

    expect(await screen.findByText(/wisselbank \(3\)/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Jan Jansen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Piet Peters' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Noor Noten' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keeper: leeg' })).toBeInTheDocument()
  })

  it('excludes an afgemeld speler from both the wisselbank and the placeable pool', async () => {
    render(
      <OpstellingScreen
        opstellingService={createFakeOpstellingService()}
        aanwezigheidService={fakeAanwezigheidService(['s3'])}
        spelerService={fakeSpelerService()}
        wedstrijd={wedstrijd}
        teamId="team-1"
      />,
    )

    expect(await screen.findByText(/wisselbank \(2\)/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Noor Noten' })).not.toBeInTheDocument()
  })

  it('falls back a speler to the wisselbank instead of losing them when their row sits on a positie outside the formatie', async () => {
    // Simulates a swap left mid-flight by a failed middle update (see
    // placeSpeler's temp-value dance): the row exists, but its positie
    // doesn't match any 1-3-3-1 slot naam.
    const opstellingService = createFakeOpstellingService({ 1: { Keeper: 's1', __swap_ghost: 's3' } })
    render(
      <OpstellingScreen
        opstellingService={opstellingService}
        aanwezigheidService={fakeAanwezigheidService()}
        spelerService={fakeSpelerService()}
        wedstrijd={wedstrijd}
        teamId="team-1"
      />,
    )

    expect(await screen.findByRole('button', { name: 'Keeper: Jan Jansen' })).toBeInTheDocument()
    // Noor is neither on a real slot nor lost: she's back on the bench.
    expect(await screen.findByText(/wisselbank \(2\)/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Noor Noten' })).toBeInTheDocument()
  })

  it('places a selected bench speler by tapping a slot, and shrinks the wisselbank', async () => {
    const user = userEvent.setup()
    const opstellingService = createFakeOpstellingService()
    render(
      <OpstellingScreen
        opstellingService={opstellingService}
        aanwezigheidService={fakeAanwezigheidService()}
        spelerService={fakeSpelerService()}
        wedstrijd={wedstrijd}
        teamId="team-1"
      />,
    )
    await screen.findByText(/wisselbank \(3\)/i)

    await user.click(screen.getByRole('button', { name: 'Jan Jansen' }))
    await user.click(screen.getByRole('button', { name: 'Keeper: leeg' }))

    await waitFor(() => expect(opstellingService.placeSpeler).toHaveBeenCalledWith('w1', 1, 'Keeper', 's1'))
    expect(await screen.findByRole('button', { name: 'Keeper: Jan Jansen' })).toBeInTheDocument()
    expect(screen.getByText(/wisselbank \(2\)/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Jan Jansen' })).not.toBeInTheDocument()
  })

  it('tapping an occupied slot with no bench selection does nothing (no sheet opens)', async () => {
    const user = userEvent.setup()
    const opstellingService = createFakeOpstellingService({ 1: { Keeper: 's1' } })
    render(
      <OpstellingScreen
        opstellingService={opstellingService}
        aanwezigheidService={fakeAanwezigheidService()}
        spelerService={fakeSpelerService()}
        wedstrijd={wedstrijd}
        teamId="team-1"
      />,
    )
    const keeperSlot = await screen.findByRole('button', { name: 'Keeper: Jan Jansen' })

    await user.click(keeperSlot)

    expect(opstellingService.placeSpeler).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Keeper: Jan Jansen' })).toBeInTheDocument()
  })

  it('places a dragged bench speler onto a slot', async () => {
    const opstellingService = createFakeOpstellingService()
    render(
      <OpstellingScreen
        opstellingService={opstellingService}
        aanwezigheidService={fakeAanwezigheidService()}
        spelerService={fakeSpelerService()}
        wedstrijd={wedstrijd}
        teamId="team-1"
      />,
    )
    const benchButton = await screen.findByRole('button', { name: 'Piet Peters' })
    const slot = screen.getByRole('button', { name: 'Linksback: leeg' })

    const dataTransfer = createDataTransfer()
    fireEvent.dragStart(benchButton, { dataTransfer })
    fireEvent.dragOver(slot, { dataTransfer })
    fireEvent.drop(slot, { dataTransfer })

    await waitFor(() => expect(opstellingService.placeSpeler).toHaveBeenCalledWith('w1', 1, 'Linksback', 's2'))
    expect(await screen.findByRole('button', { name: 'Linksback: Piet Peters' })).toBeInTheDocument()
  })

  it('swaps two placed spelers when one is dragged onto the other', async () => {
    const opstellingService = createFakeOpstellingService({ 1: { Keeper: 's1', Linksback: 's2' } })
    render(
      <OpstellingScreen
        opstellingService={opstellingService}
        aanwezigheidService={fakeAanwezigheidService()}
        spelerService={fakeSpelerService()}
        wedstrijd={wedstrijd}
        teamId="team-1"
      />,
    )
    const keeperSlot = await screen.findByRole('button', { name: 'Keeper: Jan Jansen' })
    const linksbackSlot = screen.getByRole('button', { name: 'Linksback: Piet Peters' })

    const dataTransfer = createDataTransfer()
    fireEvent.dragStart(keeperSlot, { dataTransfer })
    fireEvent.dragOver(linksbackSlot, { dataTransfer })
    fireEvent.drop(linksbackSlot, { dataTransfer })

    await waitFor(() => expect(opstellingService.placeSpeler).toHaveBeenCalledWith('w1', 1, 'Linksback', 's1'))
    expect(await screen.findByRole('button', { name: 'Keeper: Piet Peters' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Linksback: Jan Jansen' })).toBeInTheDocument()
  })

  it('shows a Dutch error message when the opstelling cannot be fetched', async () => {
    render(
      <OpstellingScreen
        opstellingService={{
          listForKwart: vi.fn().mockRejectedValue(new Error('permission denied for table opstelling')),
          placeSpeler: vi.fn(),
        }}
        aanwezigheidService={fakeAanwezigheidService()}
        spelerService={fakeSpelerService()}
        wedstrijd={wedstrijd}
        teamId="team-1"
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(/niet gelukt/i)
  })
})
