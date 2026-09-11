import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Formaat, Formatie } from '../data/types'
import { DEFAULT_FORMATIE, FORMATIE_OPTIONS } from '../data/types'
import type { WedstrijdService } from '../data/wedstrijdService'

interface NewWedstrijdScreenProps {
  wedstrijdService: WedstrijdService
  teamId: string
  /** Refreshes the parent's match list; awaited before navigating back to it. */
  onCreated: () => Promise<void>
}

/**
 * Aanmaakscherm voor een nieuwe wedstrijd (datum + formaat + formatie),
 * bereikt via de "+"-knop op `/wedstrijden` (zie `WedstrijdScreen`). Na
 * aanmaken gaat de coach terug naar de lijst, die de nieuwe wedstrijd erbij
 * ziet staan.
 */
export function NewWedstrijdScreen({ wedstrijdService, teamId, onCreated }: NewWedstrijdScreenProps) {
  const navigate = useNavigate()
  const [datum, setDatum] = useState('')
  const [formaat, setFormaat] = useState<Formaat>('8v8')
  const [formatie, setFormatie] = useState<Formatie>(DEFAULT_FORMATIE['8v8'])
  const [addError, setAddError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Op een submit-fout gaat focus hierheen (eerste/enige verplichte veld).
  const datumRef = useRef<HTMLInputElement>(null)

  function handleFormaatChange(next: Formaat) {
    setFormaat(next)
    // Reset to the new formaat's default — its options differ per formaat,
    // so the old formatie may not even be valid for it.
    setFormatie(DEFAULT_FORMATIE[next])
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAddError(null)
    setSubmitting(true)
    try {
      await wedstrijdService.create({ teamId, datum, formaat, formatie })
      await onCreated()
      navigate('/wedstrijden')
    } catch {
      setAddError('Wedstrijd aanmaken is niet gelukt. Controleer de datum.')
      setSubmitting(false)
      datumRef.current?.focus()
    }
  }

  return (
    <section className="new-wedstrijd-screen">
      <Link to="/wedstrijden">&larr; Terug naar wedstrijden</Link>
      <h2>Nieuwe wedstrijd</h2>

      <form onSubmit={handleSubmit} aria-label="Nieuwe wedstrijd aanmaken" className="add-wedstrijd-form">
        <label htmlFor="wedstrijd-datum">Datum</label>
        <input
          id="wedstrijd-datum"
          name="datum"
          autoComplete="off"
          type="date"
          required
          ref={datumRef}
          value={datum}
          onChange={(event) => setDatum(event.target.value)}
        />

        <label htmlFor="wedstrijd-formaat">Formaat</label>
        <select
          id="wedstrijd-formaat"
          name="formaat"
          autoComplete="off"
          value={formaat}
          onChange={(event) => handleFormaatChange(event.target.value as Formaat)}
        >
          <option value="8v8">8-tegen-8</option>
          <option value="11v11">11-tegen-11</option>
        </select>

        <label htmlFor="wedstrijd-formatie">Formatie</label>
        <select
          id="wedstrijd-formatie"
          name="formatie"
          autoComplete="off"
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

        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Bezig met aanmaken…' : 'Wedstrijd aanmaken'}
        </button>
      </form>
    </section>
  )
}
