import type { AanwezigheidStatus } from './types'

/** Fixed per docs/datamodel.md / CONTEXT.md — a wedstrijd always has 4 kwarten. */
export const AANTAL_KWARTEN = 4

/** One `opstelling`-rij, season-wide input for the aggregation below. */
export interface OpstellingStatRij {
  wedstrijdId: string
  kwart: number
  spelerId: string
  positie: string
  score: number | null
}

/** One `aanwezigheid`-rij, season-wide input. A speler with no row for a
 * given (wedstrijdId, spelerId) defaults to `aanwezig` (see aanwezigheidService). */
export interface AanwezigheidStatRij {
  wedstrijdId: string
  spelerId: string
  status: AanwezigheidStatus
}

/** One speler's season statistics. `meestGespeeldePositie` and
 * `bestBeoordeeldePositie` are deliberately separate fields — never combine
 * them into one number (docs/datamodel.md, CONTEXT.md). */
export interface SpelerStatistieken {
  spelerId: string
  totaleSpeeltijd: number
  wisselCount: number
  meestGespeeldePositie: string | null
  bestBeoordeeldePositie: string | null
  gemiddeldeScorePerPositie: Record<string, number>
}

export interface TeamOverzichtRegel {
  spelerId: string
  totaleSpeeltijd: number
  /** `totaleSpeeltijd - gemiddeldeSpeeltijd`; positive = speelde meer dan gemiddeld. */
  verschilTovGemiddelde: number
  wisselCount: number
}

export interface TeamOverzicht {
  gemiddeldeSpeeltijd: number
  regels: TeamOverzichtRegel[]
}

/** Meest gespeeld/best beoordeeld per positie for one speler's rows. Ties
 * resolve alphabetically by positie naam — never by row-arrival order, since
 * none of the queries feeding this have an ORDER BY and Postgres does not
 * guarantee row order without one (see statistiekenService.ts). */
function berekenPositieStatistieken(rijen: readonly OpstellingStatRij[]): {
  meestGespeeld: string | null
  bestBeoordeeld: string | null
  gemiddeldeScorePerPositie: Record<string, number>
} {
  const aantalPerPositie = new Map<string, number>()
  const scoreSomPerPositie = new Map<string, number>()
  const scoreAantalPerPositie = new Map<string, number>()

  for (const rij of rijen) {
    aantalPerPositie.set(rij.positie, (aantalPerPositie.get(rij.positie) ?? 0) + 1)
    if (rij.score !== null) {
      scoreSomPerPositie.set(rij.positie, (scoreSomPerPositie.get(rij.positie) ?? 0) + rij.score)
      scoreAantalPerPositie.set(rij.positie, (scoreAantalPerPositie.get(rij.positie) ?? 0) + 1)
    }
  }
  const posities = [...aantalPerPositie.keys()].sort((a, b) => a.localeCompare(b))

  let meestGespeeld: string | null = null
  let meesteAantal = 0
  for (const positie of posities) {
    const aantal = aantalPerPositie.get(positie)!
    if (aantal > meesteAantal) {
      meesteAantal = aantal
      meestGespeeld = positie
    }
  }

  const gemiddeldeScorePerPositie: Record<string, number> = {}
  let bestBeoordeeld: string | null = null
  let besteGemiddelde = -Infinity
  for (const positie of posities) {
    const aantalScores = scoreAantalPerPositie.get(positie) ?? 0
    if (aantalScores === 0) {
      continue
    }
    const gemiddelde = scoreSomPerPositie.get(positie)! / aantalScores
    gemiddeldeScorePerPositie[positie] = gemiddelde
    if (gemiddelde > besteGemiddelde) {
      besteGemiddelde = gemiddelde
      bestBeoordeeld = positie
    }
  }

  return { meestGespeeld, bestBeoordeeld, gemiddeldeScorePerPositie }
}

/** Full season stats per speler in `spelerIds` (typically the roster).
 * `wedstrijdIds` drives the wissel-count's (wedstrijd × kwart) loop, but only
 * for wedstrijden the coach has actually touched (see `wedstrijdenMetData`). */
export function berekenStatistiekenPerSpeler(
  spelerIds: readonly string[],
  opstellingRijen: readonly OpstellingStatRij[],
  aanwezigheidRijen: readonly AanwezigheidStatRij[],
  wedstrijdIds: readonly string[],
): Record<string, SpelerStatistieken> {
  const geplaatst = new Set(opstellingRijen.map((rij) => `${rij.wedstrijdId}:${rij.kwart}:${rij.spelerId}`))
  const statusPerWedstrijdSpeler = new Map<string, AanwezigheidStatus>()
  for (const rij of aanwezigheidRijen) {
    statusPerWedstrijdSpeler.set(`${rij.wedstrijdId}:${rij.spelerId}`, rij.status)
  }
  // Een wedstrijd zonder enige rij is nog niet aangeraakt (bv. vooraf
  // aangemaakt voor een toekomstige datum) — anders telt "geen rij = wissel"
  // elke nog-te-spelen wedstrijd als AANTAL_KWARTEN wissels per speler.
  const wedstrijdenMetData = new Set<string>()
  for (const rij of opstellingRijen) {
    wedstrijdenMetData.add(rij.wedstrijdId)
  }
  for (const rij of aanwezigheidRijen) {
    wedstrijdenMetData.add(rij.wedstrijdId)
  }
  const rijenPerSpeler = new Map<string, OpstellingStatRij[]>()
  for (const rij of opstellingRijen) {
    const lijst = rijenPerSpeler.get(rij.spelerId)
    if (lijst) {
      lijst.push(rij)
    } else {
      rijenPerSpeler.set(rij.spelerId, [rij])
    }
  }

  const resultaat: Record<string, SpelerStatistieken> = {}
  for (const spelerId of spelerIds) {
    const rijen = rijenPerSpeler.get(spelerId) ?? []

    let wisselCount = 0
    for (const wedstrijdId of wedstrijdIds) {
      if (!wedstrijdenMetData.has(wedstrijdId)) {
        continue
      }
      const status = statusPerWedstrijdSpeler.get(`${wedstrijdId}:${spelerId}`) ?? 'aanwezig'
      if (status !== 'aanwezig') {
        continue
      }
      for (let kwart = 1; kwart <= AANTAL_KWARTEN; kwart++) {
        if (!geplaatst.has(`${wedstrijdId}:${kwart}:${spelerId}`)) {
          wisselCount++
        }
      }
    }

    const { meestGespeeld, bestBeoordeeld, gemiddeldeScorePerPositie } = berekenPositieStatistieken(rijen)

    resultaat[spelerId] = {
      spelerId,
      totaleSpeeltijd: rijen.length,
      wisselCount,
      meestGespeeldePositie: meestGespeeld,
      bestBeoordeeldePositie: bestBeoordeeld,
      gemiddeldeScorePerPositie,
    }
  }
  return resultaat
}

/** Team-brede speeltijd-eerlijkheid: elke speler in `spelerIds` naast het
 * team-gemiddelde (0 wanneer de roster leeg is). */
export function berekenTeamOverzicht(
  statistiekenPerSpeler: Readonly<Record<string, SpelerStatistieken>>,
  spelerIds: readonly string[],
): TeamOverzicht {
  if (spelerIds.length === 0) {
    return { gemiddeldeSpeeltijd: 0, regels: [] }
  }

  const totaal = spelerIds.reduce((som, id) => som + (statistiekenPerSpeler[id]?.totaleSpeeltijd ?? 0), 0)
  const gemiddeldeSpeeltijd = totaal / spelerIds.length

  const regels = spelerIds.map((spelerId) => {
    const totaleSpeeltijd = statistiekenPerSpeler[spelerId]?.totaleSpeeltijd ?? 0
    return {
      spelerId,
      totaleSpeeltijd,
      verschilTovGemiddelde: totaleSpeeltijd - gemiddeldeSpeeltijd,
      wisselCount: statistiekenPerSpeler[spelerId]?.wisselCount ?? 0,
    }
  })

  return { gemiddeldeSpeeltijd, regels }
}
