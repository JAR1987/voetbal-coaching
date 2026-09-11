import { useState } from 'react'
import type { FormEvent } from 'react'
import type { ThuisUit, Wedstrijd } from '../data/types'
import type { WedstrijdgegevensInput, WedstrijdService } from '../data/wedstrijdService'

interface WedstrijdGegevensScreenProps {
  wedstrijd: Wedstrijd
  wedstrijdService: WedstrijdService
  /** Bubbles the saved wedstrijd up so WedstrijdScreen's list reflects it without a full refetch. */
  onWedstrijdUpdated: (wedstrijd: Wedstrijd) => void
}

/** Optional match-info form (tegenstander, thuis/uit, uitslag) — fillable at
 * any time after creation, never required to use a match. Reached via the
 * "Gegevens" sub-tab, see `MatchDetailScreen`. */
export function WedstrijdGegevensScreen({ wedstrijd, wedstrijdService, onWedstrijdUpdated }: WedstrijdGegevensScreenProps) {
  const [tegenstander, setTegenstander] = useState(wedstrijd.tegenstander ?? '')
  const [thuisUit, setThuisUit] = useState<ThuisUit | ''>(wedstrijd.thuisUit ?? '')
  const [eigenScore, setEigenScore] = useState(wedstrijd.eigenScore === null ? '' : String(wedstrijd.eigenScore))
  const [tegenScore, setTegenScore] = useState(wedstrijd.tegenScore === null ? '' : String(wedstrijd.tegenScore))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setSaved(false)
    setError(null)
    const gegevens: WedstrijdgegevensInput = {
      tegenstander: tegenstander.trim() || null,
      thuisUit: thuisUit || null,
      eigenScore: eigenScore.trim() === '' ? null : Number(eigenScore),
      tegenScore: tegenScore.trim() === '' ? null : Number(tegenScore),
    }
    try {
      const bijgewerkt = await wedstrijdService.updateWedstrijdgegevens(wedstrijd.id, gegevens)
      onWedstrijdUpdated(bijgewerkt)
      setSaved(true)
    } catch {
      setError('Wedstrijdgegevens opslaan is niet gelukt.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="wedstrijd-gegevens-screen">
      <h4>Wedstrijdgegevens</h4>

      {error && (
        <p role="alert" className="wedstrijd-gegevens-error">
          {error}
        </p>
      )}
      {saved && !error && <p className="wedstrijd-gegevens-saved">Opgeslagen.</p>}

      <form onSubmit={handleSubmit} aria-label="Wedstrijdgegevens vastleggen" className="wedstrijd-gegevens-form">
        <label htmlFor="wedstrijd-gegevens-tegenstander">Tegenstander</label>
        <input
          id="wedstrijd-gegevens-tegenstander"
          name="tegenstander"
          autoComplete="off"
          type="text"
          value={tegenstander}
          onChange={(event) => setTegenstander(event.target.value)}
        />

        <label htmlFor="wedstrijd-gegevens-thuisuit">Thuis/uit</label>
        <select
          id="wedstrijd-gegevens-thuisuit"
          name="thuisUit"
          value={thuisUit}
          onChange={(event) => setThuisUit(event.target.value as ThuisUit | '')}
        >
          <option value="">— onbekend —</option>
          <option value="thuis">Thuis</option>
          <option value="uit">Uit</option>
        </select>

        <label htmlFor="wedstrijd-gegevens-eigen-score">Eigen score</label>
        <input
          id="wedstrijd-gegevens-eigen-score"
          name="eigenScore"
          type="number"
          min="0"
          inputMode="numeric"
          value={eigenScore}
          onChange={(event) => setEigenScore(event.target.value)}
        />

        <label htmlFor="wedstrijd-gegevens-tegen-score">Tegen score</label>
        <input
          id="wedstrijd-gegevens-tegen-score"
          name="tegenScore"
          type="number"
          min="0"
          inputMode="numeric"
          value={tegenScore}
          onChange={(event) => setTegenScore(event.target.value)}
        />

        <button type="submit" disabled={saving}>
          {saving ? 'Bezig met opslaan…' : 'Opslaan'}
        </button>
      </form>
    </section>
  )
}
