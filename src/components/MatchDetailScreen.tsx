import { useState } from 'react'
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
  onSluiten: () => void
}

/**
 * Detail view for one selected match, opened from `WedstrijdScreen` by
 * clicking a row in the match list (see `selectedWedstrijdId` there — there
 * is still no router, per the app's "keep it simple" philosophy from ticket
 * 1; a plain bit of lifted state is enough).
 *
 * IMPORTANT for whoever builds the next ticket ("Wedstrijdgegevens
 * vastleggen" — editing tegenstander/score/thuis-uit): this component is
 * deliberately a thin composer of sibling sub-sections, not one monolithic
 * block, exactly so that ticket can slot its own section in here without
 * touching `AanwezigheidScreen` at all. Add your section as another sibling
 * next to `<AanwezigheidScreen />` below (e.g. `<WedstrijdGegevensScreen
 * wedstrijd={wedstrijd} ... />`), and extend `MatchDetailScreenProps` with
 * whatever that section needs (e.g. a `wedstrijdService` + an update
 * callback to refresh `wedstrijd` in the parent list). Resist the urge to
 * inline everything into one big return block here.
 */
export function MatchDetailScreen({
  wedstrijd,
  teamId,
  spelerService,
  aanwezigheidService,
  opstellingService,
  wedstrijdService,
  onSluiten,
}: MatchDetailScreenProps) {
  // Owned here, not in OpstellingScreen, so a later ticket (share feature)
  // can read "which kwart is actief" without reaching into that component.
  const [kwart, setKwart] = useState<number>(1)

  return (
    <section className="match-detail-screen" aria-label="Wedstrijddetail">
      <header className="match-detail-header">
        <button type="button" onClick={onSluiten}>
          &larr; Terug naar wedstrijden
        </button>
        <h3>
          {wedstrijd.datum} — {FORMAAT_LABELS[wedstrijd.formaat]} — {wedstrijd.formatie}
        </h3>
      </header>

      <KwartTimer wedstrijd={wedstrijd} wedstrijdService={wedstrijdService} />

      <AanwezigheidScreen
        aanwezigheidService={aanwezigheidService}
        spelerService={spelerService}
        wedstrijdId={wedstrijd.id}
        teamId={teamId}
      />

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

      {/* Ticket jt-dvh.14.9 "Delen van de opstelling" — own sibling section. */}
      <DeelOpstellingKnop wedstrijd={wedstrijd} teamId={teamId} kwart={kwart} opstellingService={opstellingService} spelerService={spelerService} />

      <OpstellingScreen
        opstellingService={opstellingService}
        aanwezigheidService={aanwezigheidService}
        spelerService={spelerService}
        wedstrijd={wedstrijd}
        teamId={teamId}
        kwart={kwart}
      />

      {/*
        Later ticket ("Wedstrijdgegevens vastleggen") adds a sibling section
        here, e.g.:
          <WedstrijdGegevensScreen wedstrijd={wedstrijd} ... />
      */}
    </section>
  )
}
