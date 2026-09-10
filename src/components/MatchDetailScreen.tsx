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

const KWARTEN = [1, 2, 3, 4] as const

interface MatchDetailScreenProps {
  wedstrijd: Wedstrijd
  teamId: string
  spelerService: SpelerService
  aanwezigheidService: AanwezigheidService
  opstellingService: OpstellingService
  wedstrijdService: WedstrijdService
}

/**
 * Detail view for one match, reached via `/wedstrijden/:wedstrijdId` (see
 * `WedstrijdScreen`'s nested routes for the id-lookup). Owns the header and
 * the Opstelling/Aanwezigheid sub-tab bar; Opstelling is the default/landing
 * sub-tab (bare `/wedstrijden/:id` redirects to it below).
 *
 * A future section (e.g. "Wedstrijdgegevens vastleggen") becomes its own
 * sub-route + tab here, not another sibling pasted into one return block —
 * add a `<Route path="gegevens" element={...} />` and a matching tab.
 */
export function MatchDetailScreen({
  wedstrijd,
  teamId,
  spelerService,
  aanwezigheidService,
  opstellingService,
  wedstrijdService,
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
