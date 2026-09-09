import { useCallback, useEffect, useState } from 'react'
import type { DragEvent } from 'react'
import type { AanwezigheidService } from '../data/aanwezigheidService'
import { FORMATIE_SLOTS } from '../data/formaties'
import type { OpstellingMap, OpstellingService } from '../data/opstellingService'
import type { SpelerService } from '../data/spelerService'
import type { Speler, Wedstrijd } from '../data/types'

interface OpstellingScreenProps {
  opstellingService: OpstellingService
  aanwezigheidService: AanwezigheidService
  spelerService: SpelerService
  wedstrijd: Wedstrijd
  teamId: string
}

// This ticket (jt-dvh.14.5) fixes the UI to kwart 1, but state stays keyed
// by kwart so .6 (kwart-wisselen) can extend it without a rewrite.
const KWART = 1

/** Veldweergave voor kwart 1 (ticket jt-dvh.14.5): tikken (bank-speler
 * selecteren, dan een vak) of slepen. `placeSpeler` bepaalt zelf of dat een
 * verplaatsing, wissel, of nieuwe plaatsing is. */
export function OpstellingScreen({ opstellingService, aanwezigheidService, spelerService, wedstrijd, teamId }: OpstellingScreenProps) {
  const [aanwezig, setAanwezig] = useState<Speler[]>([])
  const [opstellingPerKwart, setOpstellingPerKwart] = useState<Record<number, OpstellingMap>>({})
  const [selectedBenchSpelerId, setSelectedBenchSpelerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const spelers = await spelerService.list(teamId)
      const regels = await aanwezigheidService.listForMatch(wedstrijd.id, spelers)
      const map = await opstellingService.listForKwart(wedstrijd.id, KWART)
      setAanwezig(regels.filter((regel) => regel.status === 'aanwezig').map((regel) => regel.speler))
      setOpstellingPerKwart((prev) => ({ ...prev, [KWART]: map }))
    } catch {
      setError('Opstelling ophalen is niet gelukt.')
    } finally {
      setLoading(false)
    }
  }, [aanwezigheidService, opstellingService, spelerService, teamId, wedstrijd.id])

  useEffect(() => {
    // Same deliberate exception as AanwezigheidScreen: fetching from the
    // services and syncing it into state is this effect's whole job.
    // oxlint-disable-next-line react/set-state-in-effect
    load()
  }, [load])

  const slots = FORMATIE_SLOTS[wedstrijd.formatie]
  const opstelling = opstellingPerKwart[KWART] ?? {}
  // Een rij op een positie die niet bij deze formatie hoort (bv. een
  // afgebroken swap-tussenstap in placeSpeler) telt niet als "geplaatst" —
  // de speler valt dan terug op de wisselbank i.p.v. te verdwijnen.
  const geldigePosities = new Set(slots.map((slot) => slot.naam))
  const geplaatsteSpelerIds = new Set(
    Object.entries(opstelling)
      .filter(([positie]) => geldigePosities.has(positie))
      .map(([, spelerId]) => spelerId),
  )
  const wisselbank = aanwezig.filter((speler) => !geplaatsteSpelerIds.has(speler.id))

  async function plaatsSpeler(positie: string, spelerId: string) {
    try {
      await opstellingService.placeSpeler(wedstrijd.id, KWART, positie, spelerId)
      await load()
    } catch {
      setError('Speler plaatsen is niet gelukt.')
    }
  }

  function handleBenchTap(spelerId: string) {
    setSelectedBenchSpelerId((current) => (current === spelerId ? null : spelerId))
  }

  /** Tikken op een vak: met bank-selectie plaatst dit die speler. Zonder
   * selectie op een bezet vak: ticket .7 opent hier straks een
   * beoordelingssheet — voor dit ticket doet die tak niets. */
  function handleSlotTap(positie: string) {
    if (selectedBenchSpelerId) {
      void plaatsSpeler(positie, selectedBenchSpelerId)
      setSelectedBenchSpelerId(null)
      return
    }
    handleOccupiedSlotTapWithoutSelection()
  }

  function handleOccupiedSlotTapWithoutSelection() {
    setSelectedBenchSpelerId(null)
  }

  function handleDragStart(event: DragEvent<HTMLElement>, spelerId: string) {
    event.dataTransfer.setData('text/plain', spelerId)
    event.dataTransfer.effectAllowed = 'move'
  }

  function handleDrop(event: DragEvent<HTMLElement>, positie: string) {
    event.preventDefault()
    const spelerId = event.dataTransfer.getData('text/plain')
    if (spelerId) {
      void plaatsSpeler(positie, spelerId)
    }
  }

  function vindSpeler(spelerId: string | undefined): Speler | undefined {
    return spelerId ? aanwezig.find((speler) => speler.id === spelerId) : undefined
  }

  return (
    <section className="opstelling-screen">
      <h4>Opstelling — kwart 1</h4>

      {error && (
        <p role="alert" className="opstelling-error">
          {error}
        </p>
      )}

      {loading ? (
        <p>Opstelling laden…</p>
      ) : (
        <>
          <div className="opstelling-veld">
            {slots.map((slot) => {
              const speler = vindSpeler(opstelling[slot.naam])
              return (
                <button
                  key={slot.id}
                  type="button"
                  className={`opstelling-vak${speler ? ' bezet' : ' leeg'}`}
                  style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                  aria-label={`${slot.naam}: ${speler ? speler.naam : 'leeg'}`}
                  draggable={!!speler}
                  onDragStart={(event) => speler && handleDragStart(event, speler.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => handleDrop(event, slot.naam)}
                  onClick={() => handleSlotTap(slot.naam)}
                >
                  <span className="opstelling-vak-positie">{slot.naam}</span>
                  <span className="opstelling-vak-naam">{speler ? speler.naam : '—'}</span>
                </button>
              )
            })}
          </div>

          <div className="opstelling-wisselbank">
            <h5>Wisselbank ({wisselbank.length})</h5>
            <ul>
              {wisselbank.map((speler) => (
                <li key={speler.id}>
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => handleDragStart(event, speler.id)}
                    onClick={() => handleBenchTap(speler.id)}
                    aria-pressed={selectedBenchSpelerId === speler.id}
                  >
                    {speler.naam}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  )
}
