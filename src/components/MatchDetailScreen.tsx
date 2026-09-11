import { useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import type { AanwezigheidService } from '../data/aanwezigheidService'
import type { OpstellingService } from '../data/opstellingService'
import type { SpelerService } from '../data/spelerService'
import type { Wedstrijd } from '../data/types'
import type { WedstrijdService } from '../data/wedstrijdService'
import { FORMAAT_LABELS } from '../data/types'
import { AanwezigheidScreen } from './AanwezigheidScreen'
import { DeelOpstellingKnop } from './DeelOpstellingKnop'
import { KwartTimer } from './KwartTimer'
import { OpstellingScreen } from './OpstellingScreen'
import { WedstrijdGegevensScreen } from './WedstrijdGegevensScreen'

const KWARTEN = [1, 2, 3, 4] as const

interface MatchDetailScreenProps {
  wedstrijd: Wedstrijd
  teamId: string
  spelerService: SpelerService
  aanwezigheidService: AanwezigheidService
  opstellingService: OpstellingService
  wedstrijdService: WedstrijdService
  /** Bubbles a saved Gegevens-tab edit up to WedstrijdScreen's list, see `WedstrijdGegevensScreen`. */
  onWedstrijdUpdated: (wedstrijd: Wedstrijd) => void
}

/** Detail view for one match, reached via `/wedstrijden/:wedstrijdId` (see
 * `WedstrijdScreen`'s nested routes). Owns the header and the
 * Opstelling/Aanwezigheid/Gegevens sub-tab bar; Opstelling is the default. */
export function MatchDetailScreen({
  wedstrijd,
  teamId,
  spelerService,
  aanwezigheidService,
  opstellingService,
  wedstrijdService,
  onWedstrijdUpdated,
}: MatchDetailScreenProps) {
  // Absolute, not relative: this mounts several splat-routes deep, where
  // relative-link resolution compounds per nested `<Routes>` instead of
  // staying anchored.
  const basePath = `/wedstrijden/${wedstrijd.id}`

  return (
    <section className="match-detail-screen" aria-label="Wedstrijddetail">
      <header className="match-detail-header">
        <Link to="/wedstrijden">&larr; Terug naar wedstrijden</Link>
        <h3>
          {wedstrijd.datum} — {FORMAAT_LABELS[wedstrijd.formaat]} — {wedstrijd.formatie}
        </h3>
      </header>

      <nav className="match-detail-tabs" aria-label="Wedstrijdonderdeel">
        <NavLink to={`${basePath}/opstelling`} className={({ isActive }) => `match-detail-tab${isActive ? ' actief' : ''}`}>
          Opstelling
        </NavLink>
        <NavLink to={`${basePath}/aanwezigheid`} className={({ isActive }) => `match-detail-tab${isActive ? ' actief' : ''}`}>
          Aanwezigheid
        </NavLink>
        <NavLink to={`${basePath}/gegevens`} className={({ isActive }) => `match-detail-tab${isActive ? ' actief' : ''}`}>
          Gegevens
        </NavLink>
      </nav>

      <Routes>
        <Route index element={<Navigate to="opstelling" replace />} />
        <Route
          path="opstelling"
          element={
            <OpstellingTab
              wedstrijd={wedstrijd}
              teamId={teamId}
              spelerService={spelerService}
              aanwezigheidService={aanwezigheidService}
              opstellingService={opstellingService}
              wedstrijdService={wedstrijdService}
            />
          }
        />
        <Route
          path="aanwezigheid"
          element={
            <AanwezigheidScreen
              aanwezigheidService={aanwezigheidService}
              spelerService={spelerService}
              wedstrijdId={wedstrijd.id}
              teamId={teamId}
            />
          }
        />
        <Route
          path="gegevens"
          element={
            <WedstrijdGegevensScreen wedstrijd={wedstrijd} wedstrijdService={wedstrijdService} onWedstrijdUpdated={onWedstrijdUpdated} />
          }
        />
      </Routes>
    </section>
  )
}

interface OpstellingTabProps {
  wedstrijd: Wedstrijd
  teamId: string
  spelerService: SpelerService
  aanwezigheidService: AanwezigheidService
  opstellingService: OpstellingService
  wedstrijdService: WedstrijdService
}

/** Content of the Opstelling sub-tab — kwart-tabs, timer and share stay in-screen state, no own routes. */
function OpstellingTab({ wedstrijd, teamId, spelerService, aanwezigheidService, opstellingService, wedstrijdService }: OpstellingTabProps) {
  // Owned here, not in OpstellingScreen, so the share feature can read
  // "which kwart is actief" without reaching into that component.
  const [kwart, setKwart] = useState<number>(1)

  return (
    <>
      <KwartTimer wedstrijd={wedstrijd} wedstrijdService={wedstrijdService} />

      <div className="kwart-switcher" role="tablist" aria-label="Kwart">
        {KWARTEN.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kwart === k}
            className={`kwart-tab${kwart === k ? ' actief' : ''}`}
            onClick={() => setKwart(k)}
          >
            K{k}
          </button>
        ))}
      </div>

      <DeelOpstellingKnop wedstrijd={wedstrijd} teamId={teamId} kwart={kwart} opstellingService={opstellingService} spelerService={spelerService} />

      <OpstellingScreen
        opstellingService={opstellingService}
        aanwezigheidService={aanwezigheidService}
        spelerService={spelerService}
        wedstrijd={wedstrijd}
        teamId={teamId}
        kwart={kwart}
      />
    </>
  )
}
