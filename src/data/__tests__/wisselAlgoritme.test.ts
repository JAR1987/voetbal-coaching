import { describe, expect, it } from 'vitest'
import { genereerWisselvoorstel } from '../wisselAlgoritme'

const slots2 = [{ naam: 'Keeper' }, { naam: 'Linksback' }]

describe('genereerWisselvoorstel — eerlijke speeltijd', () => {
  it('kiest de spelers met de laagste cumulatieve speeltijd het eerst', () => {
    const voorstel = genereerWisselvoorstel({
      aanwezigeSpelerIds: ['s1', 's2', 's3', 's4'],
      cumulatieveSpeeltijd: { s1: 3, s2: 0, s3: 2, s4: 1 },
      vorigeKwartOpstelling: {},
      slots: slots2,
    })

    expect(Object.values(voorstel).sort()).toEqual(['s2', 's4'])
  })
})

describe('genereerWisselvoorstel — spreiding van bank-beurten', () => {
  it('geeft bij gelijke speeltijd voorrang aan wie vorig kwart op de bank stond', () => {
    // s1 speelde vorig kwart, s2 stond op de bank — bij gelijke speeltijd
    // moet s2 nu voorrang krijgen om te spelen.
    const voorstel = genereerWisselvoorstel({
      aanwezigeSpelerIds: ['s1', 's2'],
      cumulatieveSpeeltijd: { s1: 2, s2: 2 },
      vorigeKwartOpstelling: { Keeper: 's1' },
      slots: [{ naam: 'Keeper' }],
    })

    expect(Object.values(voorstel)).toEqual(['s2'])
  })

  it('laat cumulatieve speeltijd zwaarder wegen dan de bank-voorkeur (zachte regel, geen absolute)', () => {
    // s2 stond vorig kwart op de bank, maar heeft duidelijk meer gespeeld
    // dit seizoen dan s1 — s1 blijft dan toch geprioriteerd.
    const voorstel = genereerWisselvoorstel({
      aanwezigeSpelerIds: ['s1', 's2'],
      cumulatieveSpeeltijd: { s1: 0, s2: 5 },
      vorigeKwartOpstelling: { Keeper: 's1' },
      slots: [{ naam: 'Keeper' }],
    })

    expect(Object.values(voorstel)).toEqual(['s1'])
  })
})

describe('genereerWisselvoorstel — tie-break', () => {
  it('kiest willekeurig tussen volledig gelijke kandidaten, zonder te crashen of altijd dezelfde te kiezen', () => {
    const pool = ['s1', 's2', 's3', 's4', 's5']
    const gekozenOverAlleRuns = new Set<string>()

    for (let i = 0; i < 200; i++) {
      const voorstel = genereerWisselvoorstel({
        aanwezigeSpelerIds: pool,
        cumulatieveSpeeltijd: {},
        vorigeKwartOpstelling: {},
        slots: [{ naam: 'Keeper' }],
      })
      const [gekozen] = Object.values(voorstel)
      expect(pool).toContain(gekozen)
      gekozenOverAlleRuns.add(gekozen)
    }

    expect(gekozenOverAlleRuns.size).toBeGreaterThan(1)
  })

  it('accepteert een injectable random voor deterministische tests', () => {
    const altijdEerste = genereerWisselvoorstel({
      aanwezigeSpelerIds: ['s1', 's2', 's3'],
      cumulatieveSpeeltijd: {},
      vorigeKwartOpstelling: {},
      slots: [{ naam: 'Keeper' }],
      random: () => 0,
    })

    expect(Object.values(altijdEerste)).toHaveLength(1)
    expect(['s1', 's2', 's3']).toContain(Object.values(altijdEerste)[0])
  })
})

describe('genereerWisselvoorstel — aantal plekken', () => {
  it('vult exact zoveel posities als er slots zijn, in slot-volgorde', () => {
    const slots8 = Array.from({ length: 8 }, (_, i) => ({ naam: `positie-${i}` }))
    const spelers = Array.from({ length: 10 }, (_, i) => `s${i}`)

    const voorstel = genereerWisselvoorstel({
      aanwezigeSpelerIds: spelers,
      cumulatieveSpeeltijd: {},
      vorigeKwartOpstelling: {},
      slots: slots8,
    })

    expect(Object.keys(voorstel)).toHaveLength(8)
    expect(Object.keys(voorstel).sort()).toEqual(slots8.map((s) => s.naam).sort())
  })

  it('laat slots leeg als er minder aanwezige spelers dan slots zijn', () => {
    const voorstel = genereerWisselvoorstel({
      aanwezigeSpelerIds: ['s1'],
      cumulatieveSpeeltijd: {},
      vorigeKwartOpstelling: {},
      slots: slots2,
    })

    expect(Object.keys(voorstel)).toHaveLength(1)
  })
})
