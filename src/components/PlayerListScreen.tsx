import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Users } from 'lucide-react'
import type { SpelerService } from '../data/spelerService'
import type { Speler } from '../data/types'

interface PlayerListScreenProps {
  spelerService: SpelerService
  teamId: string
}

interface PlayerFormValues {
  naam: string
  rugnummer: string
  opmerkingen: string
}

const emptyForm: PlayerFormValues = { naam: '', rugnummer: '', opmerkingen: '' }

/** Empty/whitespace-only input becomes `null` (no rugnummer known yet), anything else is parsed as a number. */
function parseRugnummer(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Spelerslijst voor één team: toevoegen, bewerken, en op inactief zetten.
 *
 * Inactieve spelers worden nooit verwijderd (zie docs/datamodel.md) — ze
 * vallen alleen standaard buiten de lijst die hier getoond wordt, en zijn
 * met de "toon inactieve spelers"-toggle weer zichtbaar (en terug te zetten
 * op actief).
 */
export function PlayerListScreen({ spelerService, teamId }: PlayerListScreenProps) {
  const [players, setPlayers] = useState<Speler[]>([])
  const [showInactive, setShowInactive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [addForm, setAddForm] = useState<PlayerFormValues>(emptyForm)
  const [addError, setAddError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<PlayerFormValues>(emptyForm)
  const [editError, setEditError] = useState<string | null>(null)

  // Op een submit-fout gaat focus hierheen (eerste foutveld) i.p.v. alleen
  // rode tekst te tonen — alleen het naam-veld is verplicht.
  const addNaamRef = useRef<HTMLInputElement>(null)
  const editNaamRef = useRef<HTMLInputElement>(null)

  const loadPlayers = useCallback(
    async (includeInactive: boolean) => {
      setLoading(true)
      setError(null)
      try {
        const result = await spelerService.list(teamId, { includeInactive })
        setPlayers(result)
      } catch {
        setError('Spelers ophalen is niet gelukt.')
      } finally {
        setLoading(false)
      }
    },
    [spelerService, teamId],
  )

  useEffect(() => {
    // Deliberate: this effect's whole job is fetching the roster from
    // spelerService and syncing it into state (an external system, per the
    // rule's own guidance) — setLoading(true) firing synchronously as part
    // of starting that fetch is the intended behaviour, not an oversight.
    // oxlint-disable-next-line react/set-state-in-effect
    loadPlayers(showInactive)
  }, [loadPlayers, showInactive])

  async function handleAddSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAddError(null)
    setSubmitting(true)
    try {
      await spelerService.create({
        teamId,
        naam: addForm.naam,
        rugnummer: parseRugnummer(addForm.rugnummer),
        opmerkingen: addForm.opmerkingen.trim() || null,
      })
      setAddForm(emptyForm)
      await loadPlayers(showInactive)
    } catch {
      setAddError('Speler toevoegen is niet gelukt. Controleer de naam.')
      addNaamRef.current?.focus()
    } finally {
      setSubmitting(false)
    }
  }

  function startEditing(speler: Speler) {
    setEditingId(speler.id)
    setEditError(null)
    setEditForm({
      naam: speler.naam,
      rugnummer: speler.rugnummer != null ? String(speler.rugnummer) : '',
      opmerkingen: speler.opmerkingen ?? '',
    })
  }

  function cancelEditing() {
    setEditingId(null)
    setEditError(null)
    setEditForm(emptyForm)
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingId) {
      return
    }
    setEditError(null)
    try {
      await spelerService.update(editingId, {
        naam: editForm.naam,
        rugnummer: parseRugnummer(editForm.rugnummer),
        opmerkingen: editForm.opmerkingen.trim() || null,
      })
      cancelEditing()
      await loadPlayers(showInactive)
    } catch {
      setEditError('Wijzigingen opslaan is niet gelukt. Controleer de naam.')
      editNaamRef.current?.focus()
    }
  }

  async function handleSetStatus(id: string, status: 'actief' | 'inactief') {
    try {
      await spelerService.setStatus(id, status)
      await loadPlayers(showInactive)
    } catch {
      setError('Status wijzigen is niet gelukt.')
    }
  }

  return (
    <section className="player-list-screen">
      <h2>
        <Users aria-hidden="true" size={20} />
        Spelers
      </h2>

      <label className="show-inactive-toggle">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(event) => setShowInactive(event.target.checked)}
        />
        Toon inactieve spelers
      </label>

      {error && (
        <p role="alert" className="player-list-error">
          {error}
        </p>
      )}

      {loading ? (
        <p>Spelers laden…</p>
      ) : players.length === 0 ? (
        <p>Nog geen spelers toegevoegd.</p>
      ) : (
        <ul className="player-list">
          {players.map((speler) => (
            <li key={speler.id} data-status={speler.status}>
              {editingId === speler.id ? (
                <form
                  onSubmit={handleEditSubmit}
                  aria-label={`Speler ${speler.naam} bewerken`}
                  className="edit-player-form"
                >
                  <label htmlFor={`edit-naam-${speler.id}`}>Naam</label>
                  <input
                    id={`edit-naam-${speler.id}`}
                    name="naam"
                    autoComplete="off"
                    required
                    ref={editNaamRef}
                    value={editForm.naam}
                    onChange={(event) => setEditForm({ ...editForm, naam: event.target.value })}
                  />

                  <label htmlFor={`edit-rugnummer-${speler.id}`}>Rugnummer</label>
                  <input
                    id={`edit-rugnummer-${speler.id}`}
                    name="rugnummer"
                    autoComplete="off"
                    type="number"
                    value={editForm.rugnummer}
                    onChange={(event) => setEditForm({ ...editForm, rugnummer: event.target.value })}
                  />

                  <label htmlFor={`edit-opmerkingen-${speler.id}`}>Opmerkingen</label>
                  <textarea
                    id={`edit-opmerkingen-${speler.id}`}
                    name="opmerkingen"
                    autoComplete="off"
                    value={editForm.opmerkingen}
                    onChange={(event) => setEditForm({ ...editForm, opmerkingen: event.target.value })}
                  />

                  {editError && <p role="alert">{editError}</p>}

                  <button type="submit" className="btn-primary">
                    Opslaan
                  </button>
                  <button type="button" onClick={cancelEditing}>
                    Annuleren
                  </button>
                </form>
              ) : (
                <>
                  <span className="player-name">
                    {speler.naam}
                    {speler.rugnummer != null ? ` (#${speler.rugnummer})` : ''}
                    {speler.status === 'inactief' ? ' — inactief' : ''}
                  </span>
                  {speler.opmerkingen && <p className="player-notes">{speler.opmerkingen}</p>}
                  <div className="player-actions">
                    <button type="button" onClick={() => startEditing(speler)}>
                      Bewerken
                    </button>
                    {speler.status === 'actief' ? (
                      <button type="button" onClick={() => handleSetStatus(speler.id, 'inactief')}>
                        Zet inactief
                      </button>
                    ) : (
                      <button type="button" onClick={() => handleSetStatus(speler.id, 'actief')}>
                        Zet actief
                      </button>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <h3>Nieuwe speler</h3>
      <form onSubmit={handleAddSubmit} aria-label="Nieuwe speler toevoegen" className="add-player-form">
        <label htmlFor="new-naam">Naam</label>
        <input
          id="new-naam"
          name="naam"
          autoComplete="off"
          required
          ref={addNaamRef}
          value={addForm.naam}
          onChange={(event) => setAddForm({ ...addForm, naam: event.target.value })}
        />

        <label htmlFor="new-rugnummer">Rugnummer</label>
        <input
          id="new-rugnummer"
          name="rugnummer"
          autoComplete="off"
          type="number"
          value={addForm.rugnummer}
          onChange={(event) => setAddForm({ ...addForm, rugnummer: event.target.value })}
        />

        <label htmlFor="new-opmerkingen">Opmerkingen</label>
        <textarea
          id="new-opmerkingen"
          name="opmerkingen"
          autoComplete="off"
          value={addForm.opmerkingen}
          onChange={(event) => setAddForm({ ...addForm, opmerkingen: event.target.value })}
        />

        {addError && (
          <p role="alert" className="add-player-error">
            {addError}
          </p>
        )}

        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Bezig met toevoegen…' : 'Speler toevoegen'}
        </button>
      </form>
    </section>
  )
}
