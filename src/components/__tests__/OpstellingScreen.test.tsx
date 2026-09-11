import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AanwezigheidService, SpelerAanwezigheid } from '../../data/aanwezigheidService'
import type { BeoordelingMap, OpstellingMap, OpstellingService } from '../../data/opstellingService'
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
  kwartDuurSeconden: 1200,
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
 * auto-voorstel ranking for tests that trigger it. `initialBeoordelingen`
 * seeds jt-dvh.14.7's per-positie score/opmerking, keyed the same way. */
function createFakeOpstellingService(
  initial: Record<number, OpstellingMap> = {},
  cumulatieveSpeeltijd: Record<string, number> = {},
  initialBeoordelingen: Record<number, BeoordelingMap> = {},
): OpstellingService {
  const perKwart = new Map<number, OpstellingMap>(Object.entries(initial).map(([k, v]) => [Number(k), { ...v }]))
  const beoordelingenPerKwart = new Map<number, BeoordelingMap>(
    Object.entries(initialBeoordelingen).map(([k, v]) => [Number(k), { ...v }]),
  )

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
    listBeoordelingenForKwart: vi.fn(async (_wedstrijdId: string, kwart: number) => ({
      ...(beoordelingenPerKwart.get(kwart) ?? {}),
    })),
    setBeoordeling: vi.fn(async (_wedstrijdId: string, kwart: number, positie: string, score: number | null, opmerking: string | null) => {
      const map = { ...(beoordelingenPerKwart.get(kwart) ?? {}) }
      map[positie] = { score, opmerking }
      beoordelingenPerKwart.set(kwart, map)
    }),
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

/** jsdom implementeert geen `PointerEvent` (`window.PointerEvent` is
 * `undefined`), dus `fireEvent.pointerDown/Move` leveren geen `clientX`/
 * `clientY` op de event af — nodig voor de sleepdrempel-berekening. Een
 * `MouseEvent` met hetzelfde `type` triggert React's synthetic-event-
 * matching (die matcht op `event.type`, niet op de constructor) en draagt
 * `clientX`/`clientY` wél echt. */
function firePointerEventWithCoords(target: Element, type: string, clientX: number, clientY: number) {
  fireEvent(target, new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY }))
}

/** Simulates a real touch drag: touch implicitly captures the pointer to
 * `bron` (Pointer Events spec), so every event targets `bron`, never `vak` —
 * hit-testing goes through `elementFromPoint`, mocked here (see jt-dvh.14.15). */
function sleepSpelerNaarVak(bron: HTMLElement, vak: HTMLElement) {
  document.elementFromPoint = vi.fn().mockReturnValue(vak)
  firePointerEventWithCoords(bron, 'pointerdown', 1, 1)
  firePointerEventWithCoords(bron, 'pointermove', 200, 200)
  fireEvent.pointerUp(bron, { pointerId: 1, pointerType: 'touch' })
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

  it('updates the slot immediately (optimistic) instead of flashing "Opstelling laden…" while placeSpeler is still in flight (jt-dvh.14.16)', async () => {
    const user = userEvent.setup()
    let vrijgeven: () => void = () => {}
    const wachtOpVrijgave = new Promise<void>((resolve) => {
      vrijgeven = resolve
    })
    const basis = createFakeOpstellingService(GEEN_AUTO_VOORSTEL)
    const opstellingService: OpstellingService = {
      ...basis,
      placeSpeler: vi.fn(async (wedstrijdId: string, kwart: number, positie: string, spelerId: string) => {
        await wachtOpVrijgave
        await basis.placeSpeler(wedstrijdId, kwart, positie, spelerId)
      }),
    }
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

    // Meteen zichtbaar, terwijl placeSpeler nog wacht op vrijgave — geen "laden…"-flits.
    expect(screen.getByRole('button', { name: 'Keeper: Jan Jansen' })).toBeInTheDocument()
    expect(screen.queryByText('Opstelling laden…')).not.toBeInTheDocument()

    vrijgeven()
    await waitFor(() => expect(opstellingService.placeSpeler).toHaveBeenCalledWith('w1', 1, 'Keeper', 's1'))
  })

  it('rolls back to the server state and shows an error if placeSpeler fails after the optimistic update', async () => {
    const user = userEvent.setup()
    const basis = createFakeOpstellingService(GEEN_AUTO_VOORSTEL)
    const opstellingService: OpstellingService = {
      ...basis,
      placeSpeler: vi.fn().mockRejectedValue(new Error('conflict')),
    }
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

    expect(await screen.findByRole('alert')).toHaveTextContent(/niet gelukt/i)
    expect(await screen.findByRole('button', { name: 'Keeper: leeg' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Jan Jansen' })).toBeInTheDocument()
  })

  it('renders an artificially long spelernaam in a slot without erroring (layout truncation itself is CSS-only, see App.css)', async () => {
    const langeNaam = 'C'.repeat(200)
    const langeSpelers: Speler[] = [{ ...spelers[0], naam: langeNaam }]
    render(
      <OpstellingScreen
        opstellingService={createFakeOpstellingService({ 1: { Keeper: spelers[0].id } })}
        aanwezigheidService={fakeAanwezigheidService()}
        spelerService={fakeSpelerService({ list: vi.fn().mockResolvedValue(langeSpelers) })}
        wedstrijd={wedstrijd}
        teamId="team-1"
        kwart={1}
      />,
    )

    expect(await screen.findByText(langeNaam)).toHaveClass('opstelling-vak-naam')
  })

  it('tapping an empty slot with no bench selection does nothing (no sheet opens)', async () => {
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
    const keeperSlot = await screen.findByRole('button', { name: 'Keeper: leeg' })

    await user.click(keeperSlot)

    expect(opstellingService.placeSpeler).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('places a dragged bench speler onto a slot via a touch pointer', async () => {
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

    sleepSpelerNaarVak(benchButton, slot)

    await waitFor(() => expect(opstellingService.placeSpeler).toHaveBeenCalledWith('w1', 1, 'Linksback', 's2'))
    expect(await screen.findByRole('button', { name: 'Linksback: Piet Peters' })).toBeInTheDocument()
  })

  it('swaps two placed spelers when one is dragged onto the other via a touch pointer', async () => {
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

    sleepSpelerNaarVak(keeperSlot, linksbackSlot)

    await waitFor(() => expect(opstellingService.placeSpeler).toHaveBeenCalledWith('w1', 1, 'Linksback', 's1'))
    expect(await screen.findByRole('button', { name: 'Keeper: Piet Peters' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Linksback: Jan Jansen' })).toBeInTheDocument()
  })

  it('cancels the sleep without placing anyone if the pointer is released over no slot', async () => {
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
    // Vinger beweegt, maar landt boven niets herkenbaars (bv. de rand van het veld).
    document.elementFromPoint = vi.fn().mockReturnValue(null)

    fireEvent.pointerDown(benchButton, { pointerId: 1, pointerType: 'touch', clientX: 1, clientY: 1 })
    fireEvent.pointerMove(benchButton, { pointerId: 1, pointerType: 'touch', clientX: 500, clientY: 500 })
    fireEvent.pointerUp(benchButton, { pointerId: 1, pointerType: 'touch' })

    expect(opstellingService.placeSpeler).not.toHaveBeenCalled()
  })

  it('does not place a speler back on their own slot for a plain tap with only sub-drempel jitter (regression: jt-dvh.14.15 review finding)', async () => {
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
    // Vinger blijft boven hetzelfde vak "hangen": realistische tik-jitter, geen echte sleep.
    document.elementFromPoint = vi.fn().mockReturnValue(keeperSlot)

    firePointerEventWithCoords(keeperSlot, 'pointerdown', 100, 100)
    firePointerEventWithCoords(keeperSlot, 'pointermove', 103, 101) // ~3.16px, ruim onder GHOST_ACTIVATIE_PX
    fireEvent.pointerUp(keeperSlot, { pointerId: 1, pointerType: 'touch' })

    expect(opstellingService.placeSpeler).not.toHaveBeenCalled()

    // De tik zelf blijft werken: sheet gaat open, geen "laden…"-flits.
    fireEvent.click(keeperSlot)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('keeps tracking the drop target after the pointer briefly returns near the start point mid-drag', async () => {
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
    const elementFromPoint = vi.fn()
    document.elementFromPoint = elementFromPoint

    firePointerEventWithCoords(keeperSlot, 'pointerdown', 1, 1)
    elementFromPoint.mockReturnValueOnce(null)
    firePointerEventWithCoords(keeperSlot, 'pointermove', 300, 300) // ruim voorbij de drempel
    // Overshoot-and-correct: vinger komt terug dicht bij het startpunt — de
    // sleep moet actief blijven in plaats van te resetten.
    elementFromPoint.mockReturnValueOnce(keeperSlot)
    firePointerEventWithCoords(keeperSlot, 'pointermove', 2, 2)
    elementFromPoint.mockReturnValueOnce(linksbackSlot)
    firePointerEventWithCoords(keeperSlot, 'pointermove', 500, 500)
    fireEvent.pointerUp(keeperSlot, { pointerId: 1, pointerType: 'touch' })

    await waitFor(() => expect(opstellingService.placeSpeler).toHaveBeenCalledWith('w1', 1, 'Linksback', 's1'))
    expect(opstellingService.placeSpeler).toHaveBeenCalledTimes(1)
  })

  it('disables text selection immediately, but only shows the inert ghost once the drag passes the tap threshold', async () => {
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
    const benchButton = await screen.findByRole('button', { name: 'Piet Peters' })
    document.elementFromPoint = vi.fn().mockReturnValue(null)

    firePointerEventWithCoords(benchButton, 'pointerdown', 1, 1)

    expect(document.body.style.userSelect).toBe('none')
    // Nog geen beweging voorbij de drempel: geen ghost, dus geen flits bij een gewone tik.
    expect(screen.queryByText('Piet Peters', { selector: '.opstelling-drag-ghost' })).not.toBeInTheDocument()

    firePointerEventWithCoords(benchButton, 'pointermove', 200, 200)
    const ghost = await screen.findByText('Piet Peters', { selector: '.opstelling-drag-ghost' })
    expect(ghost).toHaveAttribute('inert')

    fireEvent.pointerUp(benchButton, { pointerId: 1, pointerType: 'touch' })

    await waitFor(() => expect(document.body.style.userSelect).toBe(''))
    expect(screen.queryByText('Piet Peters', { selector: '.opstelling-drag-ghost' })).not.toBeInTheDocument()
  })

  it('shows a Dutch error message when the opstelling cannot be fetched', async () => {
    render(
      <OpstellingScreen
        opstellingService={{
          listForKwart: vi.fn().mockRejectedValue(new Error('permission denied for table opstelling')),
          placeSpeler: vi.fn(),
          cumulatieveSpeeltijdPerSpeler: vi.fn(),
          listBeoordelingenForKwart: vi.fn().mockResolvedValue({}),
          setBeoordeling: vi.fn(),
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

describe('OpstellingScreen — beoordeling per speler/kwart/positie (jt-dvh.14.7)', () => {
  it('opent de beoordelingssheet als je een bezet vak tikt zonder bank-selectie', async () => {
    const user = userEvent.setup()
    render(
      <OpstellingScreen
        opstellingService={createFakeOpstellingService({ 1: { Keeper: 's1' } })}
        aanwezigheidService={fakeAanwezigheidService()}
        spelerService={fakeSpelerService()}
        wedstrijd={wedstrijd}
        teamId="team-1"
        kwart={1}
      />,
    )
    const keeperSlot = await screen.findByRole('button', { name: 'Keeper: Jan Jansen' })

    await user.click(keeperSlot)

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: /score/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Opmerking')).toBeInTheDocument()
  })

  it('zet een score van 1-5 sterren en persisteert die op Klaar', async () => {
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
    await user.click(await screen.findByRole('button', { name: 'Keeper: Jan Jansen' }))

    await user.click(screen.getByRole('radio', { name: '4 sterren' }))
    await user.click(screen.getByRole('button', { name: 'Klaar' }))

    await waitFor(() => expect(opstellingService.setBeoordeling).toHaveBeenCalledWith('w1', 1, 'Keeper', 4, null))
    expect(await screen.findByText('★4')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('voegt een vrije opmerking toe naast de score en persisteert die op Klaar', async () => {
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
    await user.click(await screen.findByRole('button', { name: 'Keeper: Jan Jansen' }))

    await user.type(screen.getByLabelText('Opmerking'), 'Sterk kwart gespeeld')
    await user.click(screen.getByRole('button', { name: 'Klaar' }))

    await waitFor(() =>
      expect(opstellingService.setBeoordeling).toHaveBeenCalledWith('w1', 1, 'Keeper', null, 'Sterk kwart gespeeld'),
    )
  })

  it('score en opmerking zijn optioneel: sluiten zonder iets in te vullen geeft geen fout', async () => {
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
    await user.click(await screen.findByRole('button', { name: 'Keeper: Jan Jansen' }))

    await user.click(screen.getByRole('button', { name: 'Klaar' }))

    await waitFor(() => expect(opstellingService.setBeoordeling).toHaveBeenCalledWith('w1', 1, 'Keeper', null, null))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('toont de bestaande score en opmerking opnieuw als je een al beoordeeld vak weer opent', async () => {
    const user = userEvent.setup()
    const opstellingService = createFakeOpstellingService(
      { 1: { Keeper: 's1' } },
      {},
      { 1: { Keeper: { score: 3, opmerking: 'Prima duels gewonnen' } } },
    )
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
    expect(await screen.findByText('★3')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Keeper: Jan Jansen' }))

    expect(screen.getByRole('radio', { name: '3 sterren' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByLabelText('Opmerking')).toHaveValue('Prima duels gewonnen')
  })

  it('bewaart een nog niet op Klaar bevestigde score/opmerking als hetzelfde vak nogmaals wordt getikt', async () => {
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
    await user.click(screen.getByRole('radio', { name: '5 sterren' }))
    await user.type(screen.getByLabelText('Opmerking'), 'Voorlopige notitie')

    await user.click(keeperSlot)

    expect(screen.getByRole('radio', { name: '5 sterren' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByLabelText('Opmerking')).toHaveValue('Voorlopige notitie')
    expect(opstellingService.setBeoordeling).not.toHaveBeenCalled()
  })

  it('sluit de sheet automatisch als de bezetting van het vak verandert terwijl hij open staat', async () => {
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
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: '5 sterren' }))

    // Een andere bank-speler wordt op hetzelfde vak gesleept terwijl de
    // sheet nog openstaat — de bezetter verandert onder de sheet vandaan.
    const anderSpeler = screen.getByRole('button', { name: 'Piet Peters' })
    sleepSpelerNaarVak(anderSpeler, keeperSlot)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Keeper: Piet Peters' })).toBeInTheDocument())
    // De sluit-sheet-effect reageert pas op de bezetter-wissel in een eigen
    // effect-flush ná die render — los blijven wachten voorkomt een race.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(opstellingService.setBeoordeling).not.toHaveBeenCalled()
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
      listBeoordelingenForKwart: vi.fn().mockResolvedValue({}),
      setBeoordeling: vi.fn(),
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
