import { describe, expect, it } from 'vitest'
import {
  berekenStatistiekenPerSpeler,
  berekenTeamOverzicht,
  type AanwezigheidStatRij,
  type OpstellingStatRij,
} from '../statistiekenAggregatie'

function rij(wedstrijdId: string, kwart: number, spelerId: string, positie: string, score: number | null = null): OpstellingStatRij {
  return { wedstrijdId, kwart, spelerId, positie, score }
}

describe('berekenStatistiekenPerSpeler — totale speeltijd', () => {
  it('counts one opstelling-rij as one kwart of speeltijd, across every wedstrijd', () => {
    const opstelling = [rij('w1', 1, 's1', 'Keeper'), rij('w1', 2, 's1', 'Keeper'), rij('w2', 1, 's1', 'Spits')]

    const result = berekenStatistiekenPerSpeler(['s1'], opstelling, [], ['w1', 'w2'])

    expect(result.s1.totaleSpeeltijd).toBe(3)
  })

  it('reports 0 speeltijd for a speler with no opstelling-rijen at all', () => {
    const result = berekenStatistiekenPerSpeler(['s1'], [], [], ['w1'])

    expect(result.s1.totaleSpeeltijd).toBe(0)
    expect(result.s1.meestGespeeldePositie).toBeNull()
    expect(result.s1.bestBeoordeeldePositie).toBeNull()
    expect(result.s1.gemiddeldeScorePerPositie).toEqual({})
  })
})

describe('berekenStatistiekenPerSpeler — wissel-count', () => {
  it('counts a kwart as a wissel when the speler is aanwezig (default) but has no opstelling-rij for it', () => {
    // s1 speelt kwart 1, staat kwart 2-4 op de bank (4 kwarten totaal, per AANTAL_KWARTEN).
    const opstelling = [rij('w1', 1, 's1', 'Keeper')]

    const result = berekenStatistiekenPerSpeler(['s1'], opstelling, [], ['w1'])

    expect(result.s1.wisselCount).toBe(3)
  })

  it('does not count a kwart as a wissel when the speler is placed in it', () => {
    const opstelling = [1, 2, 3, 4].map((kwart) => rij('w1', kwart, 's1', 'Keeper'))

    const result = berekenStatistiekenPerSpeler(['s1'], opstelling, [], ['w1'])

    expect(result.s1.wisselCount).toBe(0)
  })

  it('does not count any kwart as a wissel for a speler marked afgemeld for that wedstrijd', () => {
    const aanwezigheid: AanwezigheidStatRij[] = [{ wedstrijdId: 'w1', spelerId: 's1', status: 'afgemeld' }]

    const result = berekenStatistiekenPerSpeler(['s1'], [], aanwezigheid, ['w1'])

    expect(result.s1.wisselCount).toBe(0)
  })

  it('sums wissel-count across multiple wedstrijden in the season', () => {
    const opstelling = [rij('w1', 1, 's1', 'Keeper'), rij('w2', 1, 's1', 'Keeper'), rij('w2', 2, 's1', 'Keeper')]

    const result = berekenStatistiekenPerSpeler(['s1'], opstelling, [], ['w1', 'w2'])

    // w1: 1 gespeeld, 3 wissel. w2: 2 gespeeld, 2 wissel. Totaal 5.
    expect(result.s1.wisselCount).toBe(5)
  })

  it('does not inflate wissel-count for a wedstrijd nobody has touched yet (e.g. a future fixture with zero rows anywhere)', () => {
    // w1 is echt gespeeld (1 kwart geplaatst, 3 wissel). w2 is een vooraf
    // aangemaakte, nog niet gestarte wedstrijd: geen opstelling- of
    // aanwezigheid-rij voor wie dan ook — mag niet meetellen als 4 wissels.
    const opstelling = [rij('w1', 1, 's1', 'Keeper')]

    const result = berekenStatistiekenPerSpeler(['s1'], opstelling, [], ['w1', 'w2'])

    expect(result.s1.wisselCount).toBe(3)
  })

  it('treats a wedstrijd as touched once it has an aanwezigheid-rij, even before any opstelling-rij exists', () => {
    // w2 heeft alleen aanwezigheid, nog geen opstelling — de coach is er al
    // mee bezig (in tegenstelling tot een volledig ongeopende wedstrijd), dus
    // telt elk kwart zonder opstelling-rij hier wel als wissel.
    const aanwezigheid: AanwezigheidStatRij[] = [{ wedstrijdId: 'w2', spelerId: 's1', status: 'aanwezig' }]

    const result = berekenStatistiekenPerSpeler(['s1'], [], aanwezigheid, ['w2'])

    expect(result.s1.wisselCount).toBe(4)
  })
})

describe('berekenStatistiekenPerSpeler — favoriete positie (meest gespeeld vs. best beoordeeld)', () => {
  it('picks the positie with the most opstelling-rijen as "meest gespeeld"', () => {
    const opstelling = [
      rij('w1', 1, 's1', 'Keeper'),
      rij('w1', 2, 's1', 'Keeper'),
      rij('w1', 3, 's1', 'Spits'),
    ]

    const result = berekenStatistiekenPerSpeler(['s1'], opstelling, [], ['w1'])

    expect(result.s1.meestGespeeldePositie).toBe('Keeper')
  })

  it('breaks a tie in "meest gespeeld" alphabetically by positie naam', () => {
    const opstelling = [rij('w1', 1, 's1', 'Spits'), rij('w1', 2, 's1', 'Keeper')]

    const result = berekenStatistiekenPerSpeler(['s1'], opstelling, [], ['w1'])

    expect(result.s1.meestGespeeldePositie).toBe('Keeper')
  })

  it('resolves a "meest gespeeld" tie identically regardless of row order — Postgres gives no ORDER BY guarantee', () => {
    const opstelling = [rij('w1', 1, 's1', 'Spits'), rij('w1', 2, 's1', 'Keeper')]
    const omgekeerd = [...opstelling].reverse()

    const vooruit = berekenStatistiekenPerSpeler(['s1'], opstelling, [], ['w1'])
    const achteruit = berekenStatistiekenPerSpeler(['s1'], omgekeerd, [], ['w1'])

    expect(vooruit.s1.meestGespeeldePositie).toBe(achteruit.s1.meestGespeeldePositie)
    expect(vooruit.s1.meestGespeeldePositie).toBe('Keeper')
  })

  it('keeps "meest gespeeld" and "best beoordeeld" as two independent numbers, never combined', () => {
    // Keeper: gespeeld 5x, nooit beoordeeld. Spits: gespeeld 1x, score 5.
    const opstelling = [
      rij('w1', 1, 's1', 'Keeper'),
      rij('w1', 2, 's1', 'Keeper'),
      rij('w1', 3, 's1', 'Keeper'),
      rij('w2', 1, 's1', 'Keeper'),
      rij('w2', 2, 's1', 'Keeper'),
      rij('w2', 3, 's1', 'Spits', 5),
    ]

    const result = berekenStatistiekenPerSpeler(['s1'], opstelling, [], ['w1', 'w2'])

    expect(result.s1.meestGespeeldePositie).toBe('Keeper')
    expect(result.s1.bestBeoordeeldePositie).toBe('Spits')
  })

  it('only counts scored rijen for "best beoordeeld" — a positie with zero scores cannot win it', () => {
    const opstelling = [rij('w1', 1, 's1', 'Keeper', null), rij('w1', 2, 's1', 'Spits', 3)]

    const result = berekenStatistiekenPerSpeler(['s1'], opstelling, [], ['w1'])

    expect(result.s1.bestBeoordeeldePositie).toBe('Spits')
  })

  it('reports null for "best beoordeeld" when none of the speler\'s rijen have a score', () => {
    const opstelling = [rij('w1', 1, 's1', 'Keeper', null), rij('w1', 2, 's1', 'Spits', null)]

    const result = berekenStatistiekenPerSpeler(['s1'], opstelling, [], ['w1'])

    expect(result.s1.bestBeoordeeldePositie).toBeNull()
    expect(result.s1.gemiddeldeScorePerPositie).toEqual({})
  })

  it('breaks a tie in "best beoordeeld" alphabetically by positie naam', () => {
    const opstelling = [rij('w1', 1, 's1', 'Spits', 4), rij('w1', 2, 's1', 'Keeper', 4)]

    const result = berekenStatistiekenPerSpeler(['s1'], opstelling, [], ['w1'])

    expect(result.s1.bestBeoordeeldePositie).toBe('Keeper')
  })

  it('resolves a "best beoordeeld" tie identically regardless of row order', () => {
    const opstelling = [rij('w1', 1, 's1', 'Spits', 4), rij('w1', 2, 's1', 'Keeper', 4)]
    const omgekeerd = [...opstelling].reverse()

    const vooruit = berekenStatistiekenPerSpeler(['s1'], opstelling, [], ['w1'])
    const achteruit = berekenStatistiekenPerSpeler(['s1'], omgekeerd, [], ['w1'])

    expect(vooruit.s1.bestBeoordeeldePositie).toBe(achteruit.s1.bestBeoordeeldePositie)
    expect(vooruit.s1.bestBeoordeeldePositie).toBe('Keeper')
  })
})

describe('berekenStatistiekenPerSpeler — gemiddelde score per positie', () => {
  it('averages only the scored rijen per positie, exposed for every scored positie (not only the winner)', () => {
    const opstelling = [
      rij('w1', 1, 's1', 'Keeper', 3),
      rij('w1', 2, 's1', 'Keeper', 5),
      rij('w1', 3, 's1', 'Spits', 2),
      rij('w1', 4, 's1', 'Spits', null),
    ]

    const result = berekenStatistiekenPerSpeler(['s1'], opstelling, [], ['w1'])

    expect(result.s1.gemiddeldeScorePerPositie).toEqual({ Keeper: 4, Spits: 2 })
  })
})

describe('berekenStatistiekenPerSpeler — meerdere spelers', () => {
  it('computes independent statistics per spelerId in the given roster', () => {
    const opstelling = [rij('w1', 1, 's1', 'Keeper', 4), rij('w1', 1, 's2', 'Spits', 2)]
    const aanwezigheid: AanwezigheidStatRij[] = []

    const result = berekenStatistiekenPerSpeler(['s1', 's2', 's3'], opstelling, aanwezigheid, ['w1'])

    expect(result.s1.totaleSpeeltijd).toBe(1)
    expect(result.s2.totaleSpeeltijd).toBe(1)
    expect(result.s3.totaleSpeeltijd).toBe(0)
    expect(result.s3.wisselCount).toBe(4)
  })
})

describe('berekenTeamOverzicht', () => {
  it('computes the team average and each speler\'s signed difference from it', () => {
    const perSpeler = berekenStatistiekenPerSpeler(
      ['s1', 's2'],
      [rij('w1', 1, 's1', 'Keeper'), rij('w1', 2, 's1', 'Keeper'), rij('w1', 3, 's1', 'Keeper')],
      [],
      ['w1'],
    )

    const overzicht = berekenTeamOverzicht(perSpeler, ['s1', 's2'])

    expect(overzicht.gemiddeldeSpeeltijd).toBe(1.5)
    expect(overzicht.regels).toEqual([
      { spelerId: 's1', totaleSpeeltijd: 3, verschilTovGemiddelde: 1.5, wisselCount: 1 },
      { spelerId: 's2', totaleSpeeltijd: 0, verschilTovGemiddelde: -1.5, wisselCount: 4 },
    ])
  })

  it('returns a zeroed overzicht for an empty roster instead of dividing by zero', () => {
    const overzicht = berekenTeamOverzicht({}, [])

    expect(overzicht).toEqual({ gemiddeldeSpeeltijd: 0, regels: [] })
  })
})
