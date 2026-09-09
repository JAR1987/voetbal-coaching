import { FORMATIE_SLOTS } from './formaties'
import type { OpstellingMap, OpstellingService } from './opstellingService'
import type { SpelerService } from './spelerService'
import type { Speler, Wedstrijd } from './types'

export interface OpstellingAfbeeldingRegel {
  positie: string
  naam: string
}

export interface OpstellingAfbeeldingData {
  titel: string
  ondertitel: string
  regels: OpstellingAfbeeldingRegel[]
}

/** Pure: welke tekst in de deel-afbeelding komt voor dit kwart, los van
 * canvas/tekenen — zo te testen zonder een echte renderer. */
export function verzamelOpstellingAfbeeldingData(
  wedstrijd: Wedstrijd,
  kwart: number,
  opstelling: OpstellingMap,
  spelers: Speler[],
): OpstellingAfbeeldingData {
  const spelersPerId = new Map(spelers.map((speler) => [speler.id, speler]))
  const regels = FORMATIE_SLOTS[wedstrijd.formatie].map((slot) => {
    const spelerId = opstelling[slot.naam]
    const speler = spelerId ? spelersPerId.get(spelerId) : undefined
    return { positie: slot.naam, naam: speler?.naam ?? '—' }
  })
  return { titel: `Opstelling ${wedstrijd.datum}`, ondertitel: `Kwart ${kwart}`, regels }
}

const CANVAS_BREEDTE = 480
const KOP_HOOGTE = 80
const REGEL_HOOGTE = 28

/** Tekent `data` als eenvoudige, leesbare tekstlijst op `canvas` — geen
 * veldweergave, puur leesbaarheid volstaat (zie ticketbar jt-dvh.14.9). */
export function tekenOpstellingOpCanvas(canvas: HTMLCanvasElement, data: OpstellingAfbeeldingData): void {
  canvas.width = CANVAS_BREEDTE
  canvas.height = KOP_HOOGTE + data.regels.length * REGEL_HOOGTE + 20

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas 2D-context niet beschikbaar.')
  }

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#111111'

  ctx.font = 'bold 20px sans-serif'
  ctx.fillText(data.titel, 16, 32)
  ctx.font = '16px sans-serif'
  ctx.fillText(data.ondertitel, 16, 56)

  data.regels.forEach((regel, index) => {
    ctx.fillText(`${regel.positie}: ${regel.naam}`, 16, KOP_HOOGTE + index * REGEL_HOOGTE)
  })
}

export interface BouwOpstellingAfbeeldingParams {
  wedstrijd: Wedstrijd
  kwart: number
  teamId: string
  opstellingService: OpstellingService
  spelerService: SpelerService
}

/** Haalt de huidige kwart-opstelling en spelerslijst op en tekent ze op een
 * nieuw off-screen canvas (jt-dvh.14.9 "Delen van de opstelling"). */
export async function bouwOpstellingAfbeelding({
  wedstrijd,
  kwart,
  teamId,
  opstellingService,
  spelerService,
}: BouwOpstellingAfbeeldingParams): Promise<{ canvas: HTMLCanvasElement; data: OpstellingAfbeeldingData }> {
  const [opstelling, spelers] = await Promise.all([
    opstellingService.listForKwart(wedstrijd.id, kwart),
    spelerService.list(teamId),
  ])
  const data = verzamelOpstellingAfbeeldingData(wedstrijd, kwart, opstelling, spelers)
  const canvas = document.createElement('canvas')
  tekenOpstellingOpCanvas(canvas, data)
  return { canvas, data }
}

/** `canvas.toBlob` als Promise — verwerpt als de browser geen blob levert. */
export function canvasNaarBlob(canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('Afbeelding maken is niet gelukt.'))
      }
    }, type)
  })
}
