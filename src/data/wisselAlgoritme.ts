import type { OpstellingMap } from './opstellingService'

/** Input for `genereerWisselvoorstel` — plain data, no services (see jt-dvh.14 "Wisselalgoritme"). */
export interface WisselAlgoritmeInput {
  /** Spelers die dit kwart aanwezig zijn: kandidaten om te spelen of te bankzitten. */
  aanwezigeSpelerIds: readonly string[]
  /** Cumulatieve speeltijd dit seizoen tot nu toe (aantal opstelling-rijen) per spelerId; ontbrekend = 0. */
  cumulatieveSpeeltijd: Readonly<Record<string, number>>
  /** Opstelling van het vorige kwart in deze wedstrijd; leeg object als dit kwart 1 is. */
  vorigeKwartOpstelling: Readonly<OpstellingMap>
  /** Posities van de formatie voor deze wedstrijd, in toewijzingsvolgorde. */
  slots: readonly { naam: string }[]
  /** Injectable voor deterministische tests; standaard `Math.random`. */
  random?: () => number
}

/** Rangschikt aanwezige spelers op minst-gespeeld-eerst met een zachte
 * bank-spreidingsvoorkeur en een willekeurige tie-break bij gelijke stand;
 * vult exact `slots.length` posities (zie jt-dvh.14 "Wisselalgoritme"). */
export function genereerWisselvoorstel({
  aanwezigeSpelerIds,
  cumulatieveSpeeltijd,
  vorigeKwartOpstelling,
  slots,
  random = Math.random,
}: WisselAlgoritmeInput): OpstellingMap {
  const speeldeVorigKwart = new Set(Object.values(vorigeKwartOpstelling))

  const groepen = new Map<string, string[]>()
  for (const spelerId of aanwezigeSpelerIds) {
    const speeltijd = cumulatieveSpeeltijd[spelerId] ?? 0
    // 1 = speelde vorig kwart, 0 = stond toen op de bank (of dit is kwart 1)
    // — bij gelijke speeltijd sorteert 0 eerst, zodat wie net bankzat voorrang krijgt.
    const speeldeVorig = speeldeVorigKwart.has(spelerId) ? 1 : 0
    const sleutel = `${speeltijd}:${speeldeVorig}`
    const groep = groepen.get(sleutel)
    if (groep) {
      groep.push(spelerId)
    } else {
      groepen.set(sleutel, [spelerId])
    }
  }

  const gerangschikt = [...groepen.entries()]
    .sort(([a], [b]) => vergelijkSleutel(a, b))
    .flatMap(([, groep]) => shuffle(groep, random))

  const voorstel: OpstellingMap = {}
  slots.forEach((slot, i) => {
    const spelerId = gerangschikt[i]
    if (spelerId) {
      voorstel[slot.naam] = spelerId
    }
  })
  return voorstel
}

function vergelijkSleutel(a: string, b: string): number {
  const [speeltijdA, speeldeVorigA] = a.split(':').map(Number)
  const [speeltijdB, speeldeVorigB] = b.split(':').map(Number)
  return speeltijdA - speeltijdB || speeldeVorigA - speeldeVorigB
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
