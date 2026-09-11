import { useCallback, useEffect, useState } from 'react'
import type { AanwezigheidService, SpelerAanwezigheid } from '../data/aanwezigheidService'
import type { SpelerService } from '../data/spelerService'
import type { AanwezigheidStatus, FitheidStatus } from '../data/types'
import { FITHEID_LABELS, FITHEID_OPTIONS } from '../data/types'

interface AanwezigheidScreenProps {
  aanwezigheidService: AanwezigheidService
  spelerService: SpelerService
  wedstrijdId: string
  teamId: string
}

/**
 * Aanwezigheid + fitheid-status voor één wedstrijd (ticket "Aanwezigheid +
 * fitheid-status", jt-dvh.14.4).
 *
 * Haalt de actieve spelerslijst van het team op (spelerService.list, actief-only
 * — net als PlayerListScreen standaard doet) en merget die via
 * aanwezigheidService.listForMatch met eventuele bestaande
 * aanwezigheid-rijen voor déze wedstrijd. Zie die service voor de "geen rij
 * = aanwezig"-regel: een speler zonder rij verschijnt hier gewoon als
 * "Aanwezig" zonder fitheid, er hoeft niets aangemaakt te worden voordat de
 * coach iets wijzigt.
 *
 * Na elke wijziging (afmelden/aanwezig zetten, fitheid kiezen) wordt de hele
 * lijst opnieuw opgehaald — zelfde patroon als PlayerListScreen/
 * WedstrijdScreen na een create/update — in plaats van lokaal de state bij
 * te werken, zodat deze component niet zelf de merge-logica van de service
 * hoeft te dupliceren.
 */
export function AanwezigheidScreen({ aanwezigheidService, spelerService, wedstrijdId, teamId }: AanwezigheidScreenProps) {
  const [regels, setRegels] = useState<SpelerAanwezigheid[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const spelers = await spelerService.list(teamId)
      const result = await aanwezigheidService.listForMatch(wedstrijdId, spelers)
      setRegels(result)
    } catch {
      setError('Aanwezigheid ophalen is niet gelukt.')
    } finally {
      setLoading(false)
    }
  }, [aanwezigheidService, spelerService, teamId, wedstrijdId])

  useEffect(() => {
    // Same deliberate exception as PlayerListScreen/WedstrijdScreen: fetching
    // from the services and syncing it into state is this effect's whole job.
    // oxlint-disable-next-line react/set-state-in-effect
    load()
  }, [load])

  // Zet de rij bij met het antwoord van de service i.p.v. een volledige
  // `load()` — dat antwoord bevat de bijgewerkte rij al, dus geen
  // "laden…"-flits per tik (zelfde motief als OpstellingScreen, jt-dvh.14.16).
  async function handleSetStatus(spelerId: string, status: AanwezigheidStatus) {
    try {
      const bijgewerkt = await aanwezigheidService.setStatus(wedstrijdId, spelerId, status)
      setRegels((prev) =>
        prev.map((regel) =>
          regel.speler.id === spelerId
            ? { ...regel, status: bijgewerkt.status, fitheidStatus: bijgewerkt.fitheidStatus }
            : regel,
        ),
      )
    } catch {
      setError('Aanwezigheid wijzigen is niet gelukt.')
    }
  }

  async function handleSetFitheid(spelerId: string, fitheidStatus: FitheidStatus) {
    try {
      const bijgewerkt = await aanwezigheidService.setFitheid(wedstrijdId, spelerId, fitheidStatus)
      setRegels((prev) =>
        prev.map((regel) =>
          regel.speler.id === spelerId
            ? { ...regel, status: bijgewerkt.status, fitheidStatus: bijgewerkt.fitheidStatus }
            : regel,
        ),
      )
    } catch {
      setError('Fitheid wijzigen is niet gelukt.')
    }
  }

  return (
    <section className="aanwezigheid-screen">
      <h4>Aanwezigheid</h4>

      {error && (
        <p role="alert" className="aanwezigheid-error">
          {error}
        </p>
      )}

      {loading ? (
        <p>Aanwezigheid laden…</p>
      ) : regels.length === 0 ? (
        <p>Geen actieve spelers.</p>
      ) : (
        <ul className="aanwezigheid-list">
          {regels.map(({ speler, status, fitheidStatus }) => (
            <li key={speler.id} data-status={status} className="aanwezigheid-kaart">
              <div className="aanwezigheid-kaart-rij">
                <span className="speler-naam">{speler.naam}</span>
                <span className="aanwezigheid-status">{status === 'aanwezig' ? 'Aanwezig' : 'Afgemeld'}</span>
              </div>

              {status === 'aanwezig' ? (
                <button type="button" className="aanwezigheid-actie-knop" onClick={() => handleSetStatus(speler.id, 'afgemeld')}>
                  Afmelden
                </button>
              ) : (
                <button type="button" className="aanwezigheid-actie-knop" onClick={() => handleSetStatus(speler.id, 'aanwezig')}>
                  Aanwezig melden
                </button>
              )}

              {status === 'aanwezig' && (
                <div className="aanwezigheid-fitheid">
                  <label htmlFor={`fitheid-${speler.id}`}>Fitheid voor {speler.naam}</label>
                  <select
                    id={`fitheid-${speler.id}`}
                    value={fitheidStatus ?? ''}
                    onChange={(event) => {
                      const value = event.target.value
                      if (value) {
                        handleSetFitheid(speler.id, value as FitheidStatus)
                      }
                    }}
                  >
                    <option value="">— kies —</option>
                    {FITHEID_OPTIONS.map((optie) => (
                      <option key={optie} value={optie}>
                        {FITHEID_LABELS[optie]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
