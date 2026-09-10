import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OpstellingMap, OpstellingService } from '../opstellingService'
import type { SpelerService } from '../spelerService'
import type { Speler, Wedstrijd } from '../types'
import {
  bouwOpstellingAfbeelding,
  canvasNaarBlob,
  tekenOpstellingOpCanvas,
  verzamelOpstellingAfbeeldingData,
} from '../opstellingAfbeelding'

const wedstrijd: Wedstrijd = {
  id: 'w1',
  seizoenId: 'seizoen-1',
  datum: '2026-03-14',
  formaat: '8v8',
  formatie: '1-3-3-1',
  tegenstander: null,
  eigenScore: null,
  tegenScore: null,
  thuisUit: null,
  kwartDuurSeconden: 1200,
  createdAt: '2026-01-01T00:00:00Z',
}

const jan: Speler = {
  id: 's1',
  teamId: 'team-1',
  naam: 'Jan Jansen',
  rugnummer: 9,
  opmerkingen: null,
  status: 'actief',
  createdAt: '2026-01-01T00:00:00Z',
}

const piet: Speler = {
  id: 's2',
  teamId: 'team-1',
  naam: 'Piet Peters',
  rugnummer: 5,
  opmerkingen: null,
  status: 'actief',
  createdAt: '2026-01-01T00:00:00Z',
}

function fakeCtx(): CanvasRenderingContext2D {
  return { fillText: vi.fn(), fillRect: vi.fn(), fillStyle: '', font: '' } as unknown as CanvasRenderingContext2D
}

function fakeOpstellingService(perKwart: Record<number, OpstellingMap>): OpstellingService {
  return {
    listForKwart: vi.fn(async (_wedstrijdId: string, kwart: number) => perKwart[kwart] ?? {}),
    placeSpeler: vi.fn(),
    cumulatieveSpeeltijdPerSpeler: vi.fn(),
    listBeoordelingenForKwart: vi.fn().mockResolvedValue({}),
    setBeoordeling: vi.fn(),
  }
}

function fakeSpelerService(spelers: Speler[]): SpelerService {
  return { list: vi.fn().mockResolvedValue(spelers), create: vi.fn(), update: vi.fn(), setStatus: vi.fn() }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('verzamelOpstellingAfbeeldingData', () => {
  it('resolves each slot to the assigned speler naam, and "—" for an empty slot', () => {
    const opstelling: OpstellingMap = { Keeper: 's1', Spits: 's2' }

    const data = verzamelOpstellingAfbeeldingData(wedstrijd, 2, opstelling, [jan, piet])

    expect(data.titel).toBe('Opstelling 2026-03-14')
    expect(data.ondertitel).toBe('Kwart 2')
    expect(data.regels).toEqual([
      { positie: 'Keeper', naam: 'Jan Jansen' },
      { positie: 'Linksback', naam: '—' },
      { positie: 'Centrale verdediger', naam: '—' },
      { positie: 'Rechtsback', naam: '—' },
      { positie: 'Linksmidden', naam: '—' },
      { positie: 'Centrale middenvelder', naam: '—' },
      { positie: 'Rechtsmidden', naam: '—' },
      { positie: 'Spits', naam: 'Piet Peters' },
    ])
  })
})

describe('tekenOpstellingOpCanvas', () => {
  it('draws the title, kwart-ondertitel, and one line per slot', () => {
    const ctx = fakeCtx()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx)
    const canvas = document.createElement('canvas')
    const data = verzamelOpstellingAfbeeldingData(wedstrijd, 1, { Keeper: 's1' }, [jan])

    tekenOpstellingOpCanvas(canvas, data)

    const teksten = (ctx.fillText as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0])
    expect(teksten).toContain(data.titel)
    expect(teksten).toContain(data.ondertitel)
    expect(teksten).toContain('Keeper: Jan Jansen')
    expect(teksten).toContain('Spits: —')
  })

  it('throws a clear error when no 2D context is available', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const canvas = document.createElement('canvas')
    const data = verzamelOpstellingAfbeeldingData(wedstrijd, 1, {}, [])

    expect(() => tekenOpstellingOpCanvas(canvas, data)).toThrow(/canvas/i)
  })
})

describe('bouwOpstellingAfbeelding', () => {
  it('fetches the opstelling and spelers for the given kwart, not another one', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeCtx())
    const opstellingService = fakeOpstellingService({ 1: { Keeper: 's1' }, 2: { Spits: 's2' } })
    const spelerService = fakeSpelerService([jan, piet])

    const { data } = await bouwOpstellingAfbeelding({
      wedstrijd,
      kwart: 2,
      teamId: 'team-1',
      opstellingService,
      spelerService,
    })

    expect(opstellingService.listForKwart).toHaveBeenCalledWith('w1', 2)
    expect(spelerService.list).toHaveBeenCalledWith('team-1')
    expect(data.regels.find((regel) => regel.positie === 'Spits')?.naam).toBe('Piet Peters')
    expect(data.regels.find((regel) => regel.positie === 'Keeper')?.naam).toBe('—')
  })
})

describe('canvasNaarBlob', () => {
  it('resolves with the blob toBlob produces', async () => {
    const blob = new Blob(['fake'], { type: 'image/png' })
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(blob))
    const canvas = document.createElement('canvas')

    await expect(canvasNaarBlob(canvas)).resolves.toBe(blob)
  })

  it('rejects when the browser cannot produce a blob', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(null))
    const canvas = document.createElement('canvas')

    await expect(canvasNaarBlob(canvas)).rejects.toThrow()
  })
})
