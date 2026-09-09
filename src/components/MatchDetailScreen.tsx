import type { AanwezigheidService } from '../data/aanwezigheidService'
import type { OpstellingService } from '../data/opstellingService'
import type { SpelerService } from '../data/spelerService'
import type { Wedstrijd } from '../data/types'
import { FORMAAT_LABELS } from '../data/types'
import { AanwezigheidScreen } from './AanwezigheidScreen'
import { OpstellingScreen } from './OpstellingScreen'

interface MatchDetailScreenProps {
  wedstrijd: Wedstrijd
  teamId: string
  spelerService: SpelerService
  aanwezigheidService: AanwezigheidService
  opstellingService: OpstellingService
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
  onSluiten,
}: MatchDetailScreenProps) {
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

      <AanwezigheidScreen
        aanwezigheidService={aanwezigheidService}
        spelerService={spelerService}
        wedstrijdId={wedstrijd.id}
        teamId={teamId}
      />

      <OpstellingScreen
        opstellingService={opstellingService}
        aanwezigheidService={aanwezigheidService}
        spelerService={spelerService}
        wedstrijd={wedstrijd}
        teamId={teamId}
      />

      {/*
        Later ticket ("Wedstrijdgegevens vastleggen") adds a sibling section
        here, e.g.:
          <WedstrijdGegevensScreen wedstrijd={wedstrijd} ... />
      */}
    </section>
  )
}
