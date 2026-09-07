import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { WedstrijdService } from '../data/wedstrijdService'
import type { SpelerService } from '../data/spelerService'
import type { AanwezigheidService } from '../data/aanwezigheidService'
import type { Formaat, Formatie, Wedstrijd } from '../data/types'
import { DEFAULT_FORMATIE, FORMATIE_OPTIONS, FORMAAT_LABELS } from '../data/types'
import { MatchDetailScreen } from './MatchDetailScreen'

interface WedstrijdScreenProps {
  wedstrijdService: WedstrijdService
  spelerService: SpelerService
  aanwezigheidService: AanwezigheidService
  teamId: string
}

/**
 * Wedstrijdenlijst voor één team: een nieuwe wedstrijd aanmaken (datum +
 * formaat + formatie), de al aangemaakte wedstrijden zien, en er één openen
 * om het detailscherm te zien (aanwezigheid + fitheid, zie
 * `MatchDetailScreen`/`AanwezigheidScreen` — ticket "Aanwezigheid +
 * fitheid-status", jt-dvh.14.4).
 *
 * Het seizoen wordt automatisch bepaald/aangemaakt door wedstrijdService
 * (zie seizoenService.getOrCreateSeasonForDate) — er is bewust geen
 * seizoen-keuze in dit scherm.
 *
 * Een wedstrijd "openen" is bewust geen router/route: `selectedWedstrijdId`
 * is gewoon lokale state, en het detailscherm wordt eronder getoond (of in
 * elk geval niet als aparte pagina) zolang er nog maar één scherm is om naar
 * terug te keren — zelfde "geen router nodig" filosofie als ticket 1
 * (zie `App.tsx`). `MatchDetailScreen` beslist zelf wat het detailscherm
 * laat zien; dit scherm hoeft daar niets van te weten.
 */
export function WedstrijdScreen({ wedstrijdService, spelerService, aanwezigheidService, teamId }: WedstrijdScreenProps) {
  const [wedstrijden, setWedstrijden] = useState<Wedstrijd[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedWedstrijdId, setSelectedWedstrijdId] = useState<string | null>(null)
  const selectedWedstrijd = wedstrijden.find((wedstrijd) => wedstrijd.id === selectedWedstrijdId) ?? null

  const [datum, setDatum] = useState('')
  const [formaat, setFormaat] = useState<Formaat>('8v8')
  const [formatie, setFormatie] = useState<Formatie>(DEFAULT_FORMATIE['8v8'])
  const [addError, setAddError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

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

  function handleSelectWedstrijd(id: string) {
    // Toggle: clicking the already-selected match closes its detail view
    // again, rather than needing a separate close-only affordance for that.
    setSelectedWedstrijdId((current) => (current === id ? null : id))
  }

  function handleFormaatChange(next: Formaat) {
    setFormaat(next)
    // The formatie options depend on formaat — reset to the new format's
    // default rather than keeping a formatie that may not even be valid for
    // it (e.g. switching from 8v8's 1-2-3-2 to 11v11 shouldn't keep 1-2-3-2
    // selected).
    setFormatie(DEFAULT_FORMATIE[next])
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAddError(null)
    setSubmitting(true)
    try {
      await wedstrijdService.create({ teamId, datum, formaat, formatie })
      setDatum('')
      setFormaat('8v8')
      setFormatie(DEFAULT_FORMATIE['8v8'])
      await loadWedstrijden()
    } catch {
      setAddError('Wedstrijd aanmaken is niet gelukt. Controleer de datum.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="wedstrijd-screen">
      <h2>Wedstrijden</h2>

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
              <button
                type="button"
                className="wedstrijd-list-item"
                aria-pressed={selectedWedstrijdId === wedstrijd.id}
                onClick={() => handleSelectWedstrijd(wedstrijd.id)}
              >
                {wedstrijd.datum} — {FORMAAT_LABELS[wedstrijd.formaat]} — {wedstrijd.formatie}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedWedstrijd && (
        <MatchDetailScreen
          wedstrijd={selectedWedstrijd}
          teamId={teamId}
          spelerService={spelerService}
          aanwezigheidService={aanwezigheidService}
          onSluiten={() => setSelectedWedstrijdId(null)}
        />
      )}

      <h3>Nieuwe wedstrijd</h3>
      <form onSubmit={handleSubmit} aria-label="Nieuwe wedstrijd aanmaken" className="add-wedstrijd-form">
        <label htmlFor="wedstrijd-datum">Datum</label>
        <input
          id="wedstrijd-datum"
          type="date"
          required
          value={datum}
          onChange={(event) => setDatum(event.target.value)}
        />

        <label htmlFor="wedstrijd-formaat">Formaat</label>
        <select
          id="wedstrijd-formaat"
          value={formaat}
          onChange={(event) => handleFormaatChange(event.target.value as Formaat)}
        >
          <option value="8v8">8-tegen-8</option>
          <option value="11v11">11-tegen-11</option>
        </select>

        <label htmlFor="wedstrijd-formatie">Formatie</label>
        <select
          id="wedstrijd-formatie"
          value={formatie}
          onChange={(event) => setFormatie(event.target.value as Formatie)}
        >
          {FORMATIE_OPTIONS[formaat].map((optie) => (
            <option key={optie} value={optie}>
              {optie}
            </option>
          ))}
        </select>

        {addError && (
          <p role="alert" className="add-wedstrijd-error">
            {addError}
          </p>
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Bezig met aanmaken…' : 'Wedstrijd aanmaken'}
        </button>
      </form>
    </section>
  )
}
