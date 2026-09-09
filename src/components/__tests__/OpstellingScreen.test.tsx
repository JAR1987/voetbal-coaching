import { StrictMode } from 'react'
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
 * opstellingService.test.ts). `cumulatieveSpeeltijd` drives the jt-dvh.14.6
 * auto-voorstel ranking for tests that trigger it. */
function createFakeOpstellingService(
  initial: Record<number, OpstellingMap> = {},
  cumulatieveSpeeltijd: Record<string, number> = {},
): OpstellingService {
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
    cumulatieveSpeeltijdPerSpeler: vi.fn(async () => ({ ...cumulatieveSpeeltijd })),
  }
}

/** Seeds kwart 1 with an unrelated row so it's non-empty — keeps the
 * jt-dvh.14.6 auto-voorstel (its own tests are further below) from firing
 * and overwriting the plain empty-slot fixtures ticket .5's tests rely on. */
const GEEN_AUTO_VOORSTEL: Record<number, OpstellingMap> = { 1: { Rechtsback: 'ghost-speler' } }

function maakSpelers(n: number): Speler[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    teamId: 'team-1',
    naam: `Speler ${i}`,
    rugnummer: i,
    opmerkingen: null,
    status: 'actief' as const,
    createdAt: '2026-01-01T00:00:00Z',
  }))
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
        opstellingService={createFakeOpstellingService(GEEN_AUTO_VOORSTEL)}
        aanwezigheidService={fakeAanwezigheidService()}
        spelerService={fakeSpelerService()}
        wedstrijd={wedstrijd}
        teamId="team-1"
        kwart={1}
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
        opstellingService={createFakeOpstellingService(GEEN_AUTO_VOORSTEL)}
        aanwezigheidService={fakeAanwezigheidService(['s3'])}
        spelerService={fakeSpelerService()}
        wedstrijd={wedstrijd}
        teamId="team-1"
        kwart={1}
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
        kwart={1}
      />,
    )

    expect(await screen.findByRole('button', { name: 'Keeper: Jan Jansen' })).toBeInTheDocument()
    // Noor is neither on a real slot nor lost: she's back on the bench.
    expect(await screen.findByText(/wisselbank \(2\)/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Noor Noten' })).toBeInTheDocument()
  })

  it('places a selected bench speler by tapping a slot, and shrinks the wisselbank', async () => {
    const user = userEvent.setup()
    const opstellingService = createFakeOpstellingService(GEEN_AUTO_VOORSTEL)
    render(
      <OpstellingScreen
        opstellingService={opstellingService}
        aanwezigheidService={fakeAanwezigheidService()}
        spelerService={fakeSpelerService()}
        wedstrijd={wedstrijd}
        teamId="team-1"
        kwart={1}
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
        kwart={1}
      />,
    )
    const keeperSlot = await screen.findByRole('button', { name: 'Keeper: Jan Jansen' })

    await user.click(keeperSlot)

    expect(opstellingService.placeSpeler).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Keeper: Jan Jansen' })).toBeInTheDocument()
  })

  it('places a dragged bench speler onto a slot', async () => {
    const opstellingService = createFakeOpstellingService(GEEN_AUTO_VOORSTEL)
    render(
      <OpstellingScreen
        opstellingService={opstellingService}
        aanwezigheidService={fakeAanwezigheidService()}
        spelerService={fakeSpelerService()}
        wedstrijd={wedstrijd}
        teamId="team-1"
        kwart={1}
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
        kwart={1}
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
          cumulatieveSpeeltijdPerSpeler: vi.fn(),
        }}
        aanwezigheidService={fakeAanwezigheidService()}
        spelerService={fakeSpelerService()}
        wedstrijd={wedstrijd}
        teamId="team-1"
        kwart={1}
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(/niet gelukt/i)
  })
})

describe('OpstellingScreen — kwart-wisselen en auto-voorstel (jt-dvh.14.6)', () => {
  it('genereert en persisteert een voorstel op basis van cumulatieve speeltijd bij een leeg kwart', async () => {
    const opstellingService = createFakeOpstellingService({}, { s1: 5, s2: 0, s3: 2 })
    render(
      <OpstellingScreen
        opstellingService={opstellingService}
        aanwezigheidService={fakeAanwezigheidService()}
        spelerService={fakeSpelerService()}
        wedstrijd={wedstrijd}
        teamId="team-1"
        kwart={1}
      />,
    )

    // Speeltijd s2 (0) < s3 (2) < s1 (5): minst gespeeld speelt eerst, in slot-volgorde.
    expect(await screen.findByRole('button', { name: 'Keeper: Piet Peters' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Linksback: Noor Noten' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Centrale verdediger: Jan Jansen' })).toBeInTheDocument()
    expect(screen.getByText(/wisselbank \(0\)/i)).toBeInTheDocument()

    expect(opstellingService.cumulatieveSpeeltijdPerSpeler).toHaveBeenCalledWith('seizoen-1')
    expect(opstellingService.placeSpeler).toHaveBeenCalledWith('w1', 1, 'Keeper', 's2')
    expect(opstellingService.placeSpeler).toHaveBeenCalledWith('w1', 1, 'Linksback', 's3')
    expect(opstellingService.placeSpeler).toHaveBeenCalledWith('w1', 1, 'Centrale verdediger', 's1')
  })

  it('laat een kwart met bestaande opstelling ongemoeid — geen regeneratie', async () => {
    const opstellingService = createFakeOpstellingService({ 1: { Keeper: 's1' } }, { s1: 5, s2: 0, s3: 2 })
    render(
      <OpstellingScreen
        opstellingService={opstellingService}
        aanwezigheidService={fakeAanwezigheidService()}
        spelerService={fakeSpelerService()}
        wedstrijd={wedstrijd}
        teamId="team-1"
        kwart={1}
      />,
    )

    expect(await screen.findByRole('button', { name: 'Keeper: Jan Jansen' })).toBeInTheDocument()
    expect(opstellingService.cumulatieveSpeeltijdPerSpeler).not.toHaveBeenCalled()
    expect(opstellingService.placeSpeler).not.toHaveBeenCalled()
  })

  it('toont voor elk kwart zijn eigen, onafhankelijke opstelling bij het wisselen', async () => {
    const opstellingService = createFakeOpstellingService({ 1: { Keeper: 's1' }, 2: { Keeper: 's2' } })
    const props = {
      opstellingService,
      aanwezigheidService: fakeAanwezigheidService(),
      spelerService: fakeSpelerService(),
      wedstrijd,
      teamId: 'team-1',
    }

    const { rerender } = render(<OpstellingScreen {...props} kwart={1} />)
    expect(await screen.findByRole('button', { name: 'Keeper: Jan Jansen' })).toBeInTheDocument()

    rerender(<OpstellingScreen {...props} kwart={2} />)
    expect(await screen.findByRole('button', { name: 'Keeper: Piet Peters' })).toBeInTheDocument()

    rerender(<OpstellingScreen {...props} kwart={1} />)
    expect(await screen.findByRole('button', { name: 'Keeper: Jan Jansen' })).toBeInTheDocument()
  })

  it('staat toe dat de coach het auto-voorstel volledig overschrijft', async () => {
    const negenSpelers = maakSpelers(9)
    const speeltijd = Object.fromEntries(negenSpelers.map((speler, i) => [speler.id, i]))
    const opstellingService = createFakeOpstellingService({}, speeltijd)
    const user = userEvent.setup()

    render(
      <OpstellingScreen
        opstellingService={opstellingService}
        aanwezigheidService={fakeAanwezigheidService()}
        spelerService={fakeSpelerService({ list: vi.fn().mockResolvedValue(negenSpelers) })}
        wedstrijd={wedstrijd}
        teamId="team-1"
        kwart={1}
      />,
    )

    // p0..p7 (laagste speeltijd) spelen; p8 (hoogste) staat op de bank.
    expect(await screen.findByRole('button', { name: 'Keeper: Speler 0' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Speler 8' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Speler 8' }))
    await user.click(screen.getByRole('button', { name: 'Keeper: Speler 0' }))

    await waitFor(() => expect(opstellingService.placeSpeler).toHaveBeenCalledWith('w1', 1, 'Keeper', 'p8'))
    expect(await screen.findByRole('button', { name: 'Keeper: Speler 8' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Speler 0' })).toBeInTheDocument()
  })
})

describe('OpstellingScreen — dubbele effect-invocatie (StrictMode)', () => {
  it('genereert en persisteert het voorstel maar één keer als load() twee keer overlapt', async () => {
    // Een handmatig bestuurde gate i.p.v. een timer: garandeert dat béíde
    // overlappende `load()`-aanroepen (StrictMode's dubbele effect-
    // invocatie) `listForKwart` al hebben aangeroepen — en dus allebei
    // "leeg" gaan zien — vóórdat er ook maar één schrijft.
    let releaseGate: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve
    })
    const listForKwart = vi.fn(async () => {
      await gate
      return {}
    })
    const placeSpeler = vi.fn().mockResolvedValue(undefined)
    const opstellingService: OpstellingService = {
      listForKwart,
      placeSpeler,
      cumulatieveSpeeltijdPerSpeler: vi.fn().mockResolvedValue({ s1: 5, s2: 0, s3: 2 }),
    }

    render(
      <StrictMode>
        <OpstellingScreen
          opstellingService={opstellingService}
          aanwezigheidService={fakeAanwezigheidService()}
          spelerService={fakeSpelerService()}
          wedstrijd={wedstrijd}
          teamId="team-1"
          kwart={1}
        />
      </StrictMode>,
    )

    await waitFor(() => expect(listForKwart).toHaveBeenCalledTimes(2))
    releaseGate()

    // 3 aanwezige spelers → 3 plaatsingen. Zonder de guard zouden beide
    // overlappende `load()`-aanroepen dit onafhankelijk genereren: 6.
    await waitFor(() => expect(placeSpeler).toHaveBeenCalledTimes(3))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(placeSpeler).toHaveBeenCalledTimes(3)
  })
})
