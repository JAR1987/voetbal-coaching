import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useParams } from 'react-router-dom'
import type { SpelerService } from '../data/spelerService'
import type { AanwezigheidService } from '../data/aanwezigheidService'
import type { OpstellingService } from '../data/opstellingService'
import type { Wedstrijd } from '../data/types'
import { FORMAAT_LABELS } from '../data/types'
import type { WedstrijdService } from '../data/wedstrijdService'
import { MatchDetailScreen } from './MatchDetailScreen'
import { NewWedstrijdScreen } from './NewWedstrijdScreen'

interface WedstrijdScreenProps {
  wedstrijdService: WedstrijdService
  spelerService: SpelerService
  aanwezigheidService: AanwezigheidService
  opstellingService: OpstellingService
  teamId: string
}

/**
 * Wedstrijden-sectie voor één team, gemount op `/wedstrijden/*`: de lijst
 * (index), een eigen "nieuwe wedstrijd"-scherm (`nieuw`, zie
 * `NewWedstrijdScreen`), en een eigen route per wedstrijd (`:wedstrijdId/*`,
 * zie `MatchDetailScreen`) — elk zijn eigen scherm/URL in plaats van onder
 * elkaar gestapeld op één pagina. Het seizoen wordt automatisch
 * bepaald/aangemaakt door wedstrijdService (zie
 * seizoenService.getOrCreateSeasonForDate) — bewust geen seizoen-keuze hier.
 */
export function WedstrijdScreen({ wedstrijdService, spelerService, aanwezigheidService, opstellingService, teamId }: WedstrijdScreenProps) {
  const [wedstrijden, setWedstrijden] = useState<Wedstrijd[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadWedstrijden = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await wedstrijdService.list(teamId)
      setWedstrijden(result)
    } catch {
      setError('Wedstrijden ophalen is niet gelukt.')
    } finally {
      setLoading(false)
    }
  }, [wedstrijdService, teamId])

  useEffect(() => {
    // Same deliberate exception as PlayerListScreen: fetching from
    // wedstrijdService and syncing it into state is this effect's whole job.
    // oxlint-disable-next-line react/set-state-in-effect
    loadWedstrijden()
  }, [loadWedstrijden])

  // A saved Gegevens-tab edit patches the already-loaded row in place
  // instead of a full refetch — the match-detail screen stays mounted
  // (nested route), so nothing else would trigger a reload of the list.
  const handleWedstrijdUpdated = useCallback((updated: Wedstrijd) => {
    setWedstrijden((prev) => prev.map((wedstrijd) => (wedstrijd.id === updated.id ? updated : wedstrijd)))
  }, [])

  return (
    <Routes>
      <Route index element={<WedstrijdLijst wedstrijden={wedstrijden} loading={loading} error={error} />} />
      <Route
        path="nieuw"
        element={<NewWedstrijdScreen wedstrijdService={wedstrijdService} teamId={teamId} onCreated={loadWedstrijden} />}
      />
      <Route
        path=":wedstrijdId/*"
        element={
          <WedstrijdDetailRoute
            wedstrijden={wedstrijden}
            loading={loading}
            teamId={teamId}
            spelerService={spelerService}
            aanwezigheidService={aanwezigheidService}
            opstellingService={opstellingService}
            wedstrijdService={wedstrijdService}
            onWedstrijdUpdated={handleWedstrijdUpdated}
          />
        }
      />
    </Routes>
  )
}

/** Compact " — vs X, thuis, 3-1"-style suffix for whichever of
 * tegenstander/thuisUit/score are filled in — empty string when none are,
 * so the list item shows nothing extra (none of these fields are required). */
function formatWedstrijdExtra(wedstrijd: Wedstrijd): string {
  const details: string[] = []
  if (wedstrijd.tegenstander) {
    details.push(`vs ${wedstrijd.tegenstander}`)
  }
  if (wedstrijd.thuisUit) {
    details.push(wedstrijd.thuisUit)
  }
  if (wedstrijd.eigenScore !== null || wedstrijd.tegenScore !== null) {
    details.push(`${wedstrijd.eigenScore ?? '?'}-${wedstrijd.tegenScore ?? '?'}`)
  }
  return details.length > 0 ? ` — ${details.join(', ')}` : ''
}

interface WedstrijdLijstProps {
  wedstrijden: Wedstrijd[]
  loading: boolean
  error: string | null
}

/** De lijst-only weergave op `/wedstrijden` — aanmaken gebeurt op zijn eigen scherm, zie de "+"-link hieronder naar `nieuw`. */
function WedstrijdLijst({ wedstrijden, loading, error }: WedstrijdLijstProps) {
  return (
    <section className="wedstrijd-screen">
      <header className="wedstrijd-screen-header">
        <h2>Wedstrijden</h2>
        <Link to="/wedstrijden/nieuw" className="wedstrijd-nieuw-knop" aria-label="Nieuwe wedstrijd">
          +
        </Link>
      </header>

      {error && (
        <p role="alert" className="wedstrijd-list-error">
          {error}
        </p>
      )}

      {loading ? (
        <p>Wedstrijden laden…</p>
      ) : wedstrijden.length === 0 ? (
        <p>Nog geen wedstrijden aangemaakt.</p>
      ) : (
        <ul className="wedstrijd-list">
          {wedstrijden.map((wedstrijd) => (
            <li key={wedstrijd.id}>
              <Link to={`/wedstrijden/${wedstrijd.id}`} className="wedstrijd-list-item">
                {wedstrijd.datum} — {FORMAAT_LABELS[wedstrijd.formaat]} — {wedstrijd.formatie}
                {formatWedstrijdExtra(wedstrijd)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

interface WedstrijdDetailRouteProps {
  wedstrijden: Wedstrijd[]
  loading: boolean
  teamId: string
  spelerService: SpelerService
  aanwezigheidService: AanwezigheidService
  opstellingService: OpstellingService
  wedstrijdService: WedstrijdService
  onWedstrijdUpdated: (wedstrijd: Wedstrijd) => void
}

/** Zoekt de wedstrijd bij `:wedstrijdId` op in de al opgehaalde lijst en toont `MatchDetailScreen` ervoor — terug naar de lijst als hij (nog) niet bestaat. */
function WedstrijdDetailRoute({
  wedstrijden,
  loading,
  teamId,
  spelerService,
  aanwezigheidService,
  opstellingService,
  wedstrijdService,
  onWedstrijdUpdated,
}: WedstrijdDetailRouteProps) {
  const { wedstrijdId } = useParams<{ wedstrijdId: string }>()
  const wedstrijd = wedstrijden.find((item) => item.id === wedstrijdId) ?? null

  if (loading) {
    return <p>Wedstrijd laden…</p>
  }
  if (!wedstrijd) {
    return <Navigate to="/wedstrijden" replace />
  }

  return (
    <MatchDetailScreen
      wedstrijd={wedstrijd}
      teamId={teamId}
      spelerService={spelerService}
      aanwezigheidService={aanwezigheidService}
      opstellingService={opstellingService}
      wedstrijdService={wedstrijdService}
      onWedstrijdUpdated={onWedstrijdUpdated}
    />
  )
}
