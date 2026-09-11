import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SeizoenService } from '../data/seizoenService'
import type { SpelerService } from '../data/spelerService'
import type { SeizoenStatistieken, StatistiekenService } from '../data/statistiekenService'
import type { Seizoen, Speler } from '../data/types'

interface DashboardScreenProps {
  seizoenService: SeizoenService
  spelerService: SpelerService
  statistiekenService: StatistiekenService
  teamId: string
}

function formatGetal(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function formatVerschil(value: number): string {
  const afgerond = formatGetal(Math.abs(value))
  if (value > 0) return `+${afgerond}`
  if (value < 0) return `-${afgerond}`
  return afgerond
}

/**
 * Statistieken-dashboard (jt-dvh.14.11): seizoen-switcher, per-speler profiel
 * en team-overzicht. Aggregatie zit in `statistiekenService` — dit component
 * laadt alleen/rendert. "Meest gespeeld"/"best beoordeeld" blijven apart (docs/datamodel.md).
 */
export function DashboardScreen({ seizoenService, spelerService, statistiekenService, teamId }: DashboardScreenProps) {
  const [seizoenen, setSeizoenen] = useState<Seizoen[]>([])
  const [spelers, setSpelers] = useState<Speler[]>([])
  const [seizoenId, setSeizoenId] = useState<string | null>(null)
  const [resultaat, setResultaat] = useState<SeizoenStatistieken | null>(null)
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const seizoenenAflopend = useMemo(() => [...seizoenen].sort((a, b) => b.naam.localeCompare(a.naam)), [seizoenen])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [seizoenenResult, spelersResult] = await Promise.all([seizoenService.list(teamId), spelerService.list(teamId)])
      setSeizoenen(seizoenenResult)
      setSpelers(spelersResult)
      const aflopend = [...seizoenenResult].sort((a, b) => b.naam.localeCompare(a.naam))
      setSeizoenId((huidig) => huidig ?? aflopend[0]?.id ?? null)
    } catch {
      setError('Seizoenen/spelers ophalen is niet gelukt.')
    } finally {
      setLoading(false)
    }
  }, [seizoenService, spelerService, teamId])

  useEffect(() => {
    // Zelfde uitzondering als AanwezigheidScreen: ophalen + syncen naar state
    // is de hele taak van dit effect.
    // oxlint-disable-next-line react/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    if (!seizoenId || spelers.length === 0) {
      return
    }
    const actieveSeizoenId = seizoenId
    const spelerIds = spelers.map((speler) => speler.id)

    async function laadStatistieken() {
      setStatsLoading(true)
      try {
        const result = await statistiekenService.berekenVoorSeizoen(actieveSeizoenId, spelerIds)
        setResultaat(result)
      } catch {
        setError('Statistieken ophalen is niet gelukt.')
      } finally {
        setStatsLoading(false)
      }
    }
    // oxlint-disable-next-line react/set-state-in-effect
    laadStatistieken()
  }, [statistiekenService, seizoenId, spelers])

  return (
    <section className="dashboard-screen">
      <h1>Dashboard</h1>

      {error && <p role="alert">{error}</p>}

      {loading ? (
        <p>Dashboard laden…</p>
      ) : seizoenen.length === 0 ? (
        <p>Nog geen seizoen aangemaakt.</p>
      ) : (
        <>
          <label htmlFor="dashboard-seizoen">Seizoen</label>
          <select id="dashboard-seizoen" value={seizoenId ?? ''} onChange={(event) => setSeizoenId(event.target.value)}>
            {seizoenenAflopend.map((seizoen) => (
              <option key={seizoen.id} value={seizoen.id}>
                {seizoen.naam}
              </option>
            ))}
          </select>

          {spelers.length === 0 ? (
            <p>Nog geen actieve spelers.</p>
          ) : statsLoading || !resultaat ? (
            <p>Statistieken laden…</p>
          ) : (
            <>
              <TeamOverzichtSectie resultaat={resultaat} spelers={spelers} />
              <SpelerProfielen resultaat={resultaat} spelers={spelers} />
            </>
          )}
        </>
      )}
    </section>
  )
}

function TeamOverzichtSectie({ resultaat, spelers }: { resultaat: SeizoenStatistieken; spelers: Speler[] }) {
  const naamPerSpeler = new Map(spelers.map((speler) => [speler.id, speler.naam]))

  return (
    <section aria-labelledby="team-overzicht-titel">
      <h2 id="team-overzicht-titel">Team-overzicht — speeltijd-eerlijkheid</h2>
      <p>Gemiddelde speeltijd: {formatGetal(resultaat.teamOverzicht.gemiddeldeSpeeltijd)} kwarten</p>
      <table>
        <thead>
          <tr>
            <th scope="col">Speler</th>
            <th scope="col">Speeltijd</th>
            <th scope="col">T.o.v. gemiddelde</th>
            <th scope="col">Aantal keer wissel</th>
          </tr>
        </thead>
        <tbody>
          {resultaat.teamOverzicht.regels.map((regel) => (
            <tr key={regel.spelerId}>
              <td>{naamPerSpeler.get(regel.spelerId) ?? regel.spelerId}</td>
              <td>{regel.totaleSpeeltijd}</td>
              <td>{formatVerschil(regel.verschilTovGemiddelde)}</td>
              <td>{regel.wisselCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function SpelerProfielen({ resultaat, spelers }: { resultaat: SeizoenStatistieken; spelers: Speler[] }) {
  return (
    <section aria-label="Spelerprofielen">
      {spelers.map((speler) => {
        const stats = resultaat.perSpeler[speler.id]
        const posities = Object.entries(stats?.gemiddeldeScorePerPositie ?? {})
        return (
          <article key={speler.id} aria-labelledby={`profiel-${speler.id}`}>
            <h3 id={`profiel-${speler.id}`}>{speler.naam}</h3>
            <dl>
              <dt>Totale speeltijd</dt>
              <dd>{stats?.totaleSpeeltijd ?? 0} kwarten</dd>
              <dt>Aantal keer wissel</dt>
              <dd>{stats?.wisselCount ?? 0}</dd>
              <dt>Meest gespeelde positie</dt>
              <dd>{stats?.meestGespeeldePositie ?? '—'}</dd>
              <dt>Best beoordeelde positie</dt>
              <dd>{stats?.bestBeoordeeldePositie ?? '—'}</dd>
            </dl>
            {posities.length > 0 && (
              <>
                <h4>Gemiddelde score per positie</h4>
                <ul>
                  {posities.map(([positie, gemiddelde]) => (
                    <li key={positie}>
                      {positie}: {formatGetal(gemiddelde)}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {speler.opmerkingen && <p>Opmerkingen: {speler.opmerkingen}</p>}
          </article>
        )
      })}
    </section>
  )
}
