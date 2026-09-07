import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { WedstrijdService } from '../data/wedstrijdService'
import type { Formaat, Formatie, Wedstrijd } from '../data/types'
import { DEFAULT_FORMATIE, FORMATIE_OPTIONS } from '../data/types'

interface WedstrijdScreenProps {
  wedstrijdService: WedstrijdService
  teamId: string
}

const FORMAAT_LABELS: Record<Formaat, string> = {
  '8v8': '8-tegen-8',
  '11v11': '11-tegen-11',
}

/**
 * Wedstrijdenlijst voor één team: een nieuwe wedstrijd aanmaken (datum +
 * formaat + formatie) en de al aangemaakte wedstrijden zien.
 *
 * Het seizoen wordt automatisch bepaald/aangemaakt door wedstrijdService
 * (zie seizoenService.getOrCreateSeasonForDate) — er is bewust geen
 * seizoen-keuze in dit scherm. Wedstrijdgegevens (tegenstander/score/thuis-
 * of-uit) worden hier ook nog niet ingevuld — dat is de latere ticket
 * "Wedstrijdgegevens vastleggen"; dit scherm toont alleen genoeg (datum,
 * formaat, formatie) om te bevestigen dat het aanmaken gelukt is. Een volledig
 * wedstrijd-detailscherm valt buiten deze ticket.
 */
export function WedstrijdScreen({ wedstrijdService, teamId }: WedstrijdScreenProps) {
  const [wedstrijden, setWedstrijden] = useState<Wedstrijd[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
              {wedstrijd.datum} — {FORMAAT_LABELS[wedstrijd.formaat]} — {wedstrijd.formatie}
            </li>
          ))}
        </ul>
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
