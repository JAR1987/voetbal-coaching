import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { AanwezigheidService } from '../data/aanwezigheidService'
import { FORMATIE_SLOTS } from '../data/formaties'
import type { Beoordeling, BeoordelingMap, OpstellingMap, OpstellingService } from '../data/opstellingService'
import type { SpelerService } from '../data/spelerService'
import type { Speler, Wedstrijd } from '../data/types'
import { genereerWisselvoorstel } from '../data/wisselAlgoritme'

// Sleep pas tonen (ghost) na deze verplaatsing (px) — voorkomt een flits bij
// een gewone tik op een bezet vak (jt-dvh.14.15 review).
const GHOST_ACTIVATIE_PX = 8

/** Spiegelt `opstellingService.placeSpeler`'s afleiding (zie die functie) —
 * meteen zichtbaar zonder op de server te wachten (optimistic UI, jt-dvh.14.16).
 * Bij een mislukte server-call valt `plaatsSpeler` terug op een volledige `load()`. */
function pasPlaatsingLokaalToe(map: OpstellingMap, positie: string, spelerId: string): OpstellingMap {
  const oudePositie = Object.keys(map).find((p) => map[p] === spelerId)
  if (oudePositie === positie) {
    return map
  }
  const bezetDoor = map[positie]
  const volgende = { ...map }
  if (oudePositie) {
    delete volgende[oudePositie]
  }
  if (bezetDoor && bezetDoor !== spelerId && oudePositie) {
    volgende[oudePositie] = bezetDoor
  }
  volgende[positie] = spelerId
  return volgende
}

interface OpstellingScreenProps {
  opstellingService: OpstellingService
  aanwezigheidService: AanwezigheidService
  spelerService: SpelerService
  wedstrijd: Wedstrijd
  teamId: string
  /** Which kwart (1-4) to show; owned by `MatchDetailScreen`. */
  kwart: number
}

/** Veldweergave voor het huidige kwart (ticket jt-dvh.14.5/.6): tikken
 * (bank-speler selecteren, dan een vak) of slepen. `placeSpeler` bepaalt
 * zelf of dat een verplaatsing, wissel, of nieuwe plaatsing is. */
export function OpstellingScreen({ opstellingService, aanwezigheidService, spelerService, wedstrijd, teamId, kwart }: OpstellingScreenProps) {
  const [aanwezig, setAanwezig] = useState<Speler[]>([])
  const [opstellingPerKwart, setOpstellingPerKwart] = useState<Record<number, OpstellingMap>>({})
  const [beoordelingenPerKwart, setBeoordelingenPerKwart] = useState<Record<number, BeoordelingMap>>({})
  const [selectedBenchSpelerId, setSelectedBenchSpelerId] = useState<string | null>(null)
  // Sleepstatus (zie jt-dvh.14.15): welke speler wordt gesleept en de
  // laatste aanwijzerpositie voor de ghost. `null` = niet aan het slepen.
  const [dragSpelerId, setDragSpelerId] = useState<string | null>(null)
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)
  // Startpositie van de sleep — buiten React-state, want alleen de
  // pointer-effect hieronder leest 'm om de ghost pas na een kleine
  // verplaatsing te tonen.
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  // Welke positie's beoordelingssheet open staat (ticket .7); null = gesloten.
  const [beoordeelPositie, setBeoordeelPositie] = useState<string | null>(null)
  // SpelerId die bezette positie had toen de sheet openging — bewaakt tegen
  // een plaatsing/wissel elders die diezelfde positie tijdens het bewerken
  // van bezetter wisselt (zie effect hieronder).
  const [beoordeelSpelerId, setBeoordeelSpelerId] = useState<string | null>(null)
  const [scoreBuffer, setScoreBuffer] = useState<number | null>(null)
  const [opmerkingBuffer, setOpmerkingBuffer] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Kwarten met een voorstel al onderweg — voorkomt dat een dubbele `load()`
  // (StrictMode's dubbele effect-invocatie) twee keer tegelijk genereert en
  // zo de (wedstrijd_id, kwart, positie) unique constraint schendt.
  const voorstelInVlucht = useRef<Set<number>>(new Set())

  /** Als dit kwart nog geen opstelling-rij heeft, genereert en persisteert
   * dit een wisselvoorstel (jt-dvh.14 "Wisselalgoritme") — een kwart met
   * bestaande rijen blijft ongemoeid. */
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const spelers = await spelerService.list(teamId)
      const regels = await aanwezigheidService.listForMatch(wedstrijd.id, spelers)
      const aanwezigeSpelers = regels.filter((regel) => regel.status === 'aanwezig').map((regel) => regel.speler)

      const [initialMap, beoordelingen] = await Promise.all([
        opstellingService.listForKwart(wedstrijd.id, kwart),
        opstellingService.listBeoordelingenForKwart(wedstrijd.id, kwart),
      ])
      let map = initialMap
      if (Object.keys(map).length === 0 && !voorstelInVlucht.current.has(kwart)) {
        voorstelInVlucht.current.add(kwart)
        try {
          const [cumulatieveSpeeltijd, vorigeKwartOpstelling] = await Promise.all([
            opstellingService.cumulatieveSpeeltijdPerSpeler(wedstrijd.seizoenId),
            kwart > 1 ? opstellingService.listForKwart(wedstrijd.id, kwart - 1) : Promise.resolve({}),
          ])
          const voorstel = genereerWisselvoorstel({
            aanwezigeSpelerIds: aanwezigeSpelers.map((speler) => speler.id),
            cumulatieveSpeeltijd,
            vorigeKwartOpstelling,
            slots: FORMATIE_SLOTS[wedstrijd.formatie],
          })
          for (const [positie, spelerId] of Object.entries(voorstel)) {
            await opstellingService.placeSpeler(wedstrijd.id, kwart, positie, spelerId)
          }
          map = voorstel
        } finally {
          voorstelInVlucht.current.delete(kwart)
        }
      }

      setAanwezig(aanwezigeSpelers)
      setOpstellingPerKwart((prev) => ({ ...prev, [kwart]: map }))
      setBeoordelingenPerKwart((prev) => ({ ...prev, [kwart]: beoordelingen }))
    } catch {
      setError('Opstelling ophalen is niet gelukt.')
    } finally {
      setLoading(false)
    }
  }, [aanwezigheidService, opstellingService, spelerService, teamId, wedstrijd.id, wedstrijd.seizoenId, wedstrijd.formatie, kwart])

  useEffect(() => {
    // Same deliberate exception as AanwezigheidScreen: fetching from the
    // services and syncing it into state is this effect's whole job.
    // oxlint-disable-next-line react/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    setBeoordeelPositie(null)
    // oxlint-disable-next-line react/set-state-in-effect
    setBeoordeelSpelerId(null)
  }, [kwart])

  const slots = FORMATIE_SLOTS[wedstrijd.formatie]
  const opstelling = opstellingPerKwart[kwart] ?? {}
  const beoordelingen = beoordelingenPerKwart[kwart] ?? {}

  // Primitive, niet het hele `opstelling`-object: anders triggert de effect
  // hieronder op elke render (nieuwe object-referentie na elke `load()`).
  const huidigeBezetter = beoordeelPositie ? opstelling[beoordeelPositie] : undefined

  useEffect(() => {
    // Bewaakt tegen een plaatsing/wissel elders die de bezetter van
    // `beoordeelPositie` verandert terwijl de sheet nog open staat (bv. een
    // sleep-actie op hetzelfde vak) — anders zou "Klaar" de nog-gebufferde
    // score/opmerking op de nieuwe bezetter plakken. Sluit dan gewoon de
    // sheet; de coach opent 'm opnieuw voor de juiste speler.
    if (beoordeelPositie && huidigeBezetter !== beoordeelSpelerId) {
      // oxlint-disable-next-line react/set-state-in-effect
      setBeoordeelPositie(null)
    }
  }, [huidigeBezetter, beoordeelPositie, beoordeelSpelerId])

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

  // useCallback (net als `load`): stabiele identiteit zodat de sleep-effect
  // hieronder niet op elke render zijn document-listeners hoeft te vervangen.
  const plaatsSpeler = useCallback(
    async (positie: string, spelerId: string) => {
      // Optimistic: de state hieronder update meteen, vóór de server-call —
      // geen `loading`-flip dus geen "laden…"-flits per tik (jt-dvh.14.16).
      setOpstellingPerKwart((prev) => ({
        ...prev,
        [kwart]: pasPlaatsingLokaalToe(prev[kwart] ?? {}, positie, spelerId),
      }))
      try {
        await opstellingService.placeSpeler(wedstrijd.id, kwart, positie, spelerId)
      } catch {
        // Mislukt: terugvallen op de server-waarheid i.p.v. de optimistische
        // (mogelijk foute) state te laten staan. Ná `load()` pas de foutmelding
        // zetten — `load()` zet `error` zelf eerst op `null`.
        await load()
        setError('Speler plaatsen is niet gelukt.')
      }
    },
    [opstellingService, wedstrijd.id, kwart, load],
  )

  function handleBenchTap(spelerId: string) {
    setSelectedBenchSpelerId((current) => (current === spelerId ? null : spelerId))
  }

  /** Tikken op een vak: met bank-selectie plaatst dit die speler. Zonder
   * selectie op een bezet vak opent dit de beoordelingssheet (ticket .7);
   * op een leeg vak gebeurt er niets. */
  function handleSlotTap(positie: string) {
    if (selectedBenchSpelerId) {
      void plaatsSpeler(positie, selectedBenchSpelerId)
      setSelectedBenchSpelerId(null)
      return
    }
    handleOccupiedSlotTapWithoutSelection(positie)
  }

  function handleOccupiedSlotTapWithoutSelection(positie: string) {
    setSelectedBenchSpelerId(null)
    // Al open op dit vak: niet opnieuw initialiseren, anders verdwijnt een
    // nog niet op "Klaar" bevestigde score/opmerking bij een dubbele tik.
    if (positie === beoordeelPositie) {
      return
    }
    const spelerId = opstelling[positie]
    if (!spelerId) {
      return
    }
    const bestaande: Beoordeling | undefined = beoordelingen[positie]
    setBeoordeelPositie(positie)
    setBeoordeelSpelerId(spelerId)
    setScoreBuffer(bestaande?.score ?? null)
    setOpmerkingBuffer(bestaande?.opmerking ?? '')
  }

  /** Sluit de beoordelingssheet: persisteert score/opmerking (beide
   * optioneel) op de bestaande opstelling-rij en herlaadt daarna, zodat het
   * on-pitch sterretje en een volgende keer openen de nieuwe waarde tonen. */
  async function handleBeoordelingKlaar() {
    if (!beoordeelPositie) {
      return
    }
    try {
      await opstellingService.setBeoordeling(
        wedstrijd.id,
        kwart,
        beoordeelPositie,
        scoreBuffer,
        opmerkingBuffer.trim() === '' ? null : opmerkingBuffer,
      )
      setBeoordeelPositie(null)
      await load()
    } catch {
      setError('Beoordeling opslaan is niet gelukt.')
    }
  }

  // Geen `preventDefault` bij het starten van een sleep: dat zou op touch ook
  // de compat-click onderdrukken die tikken (onClick) nodig heeft.
  function handleDragPointerDown(event: ReactPointerEvent<HTMLElement>, spelerId: string) {
    dragStartRef.current = { x: event.clientX, y: event.clientY }
    setDragSpelerId(spelerId)
  }

  // Tijdens een sleep: tekstselectie uit (touch houdt anders soms een
  // selectie-bubble vast) — hersteld zodra de sleep stopt.
  useEffect(() => {
    if (dragSpelerId === null) {
      return
    }
    document.body.style.userSelect = 'none'
    return () => {
      document.body.style.userSelect = ''
    }
  }, [dragSpelerId])

  // Document-breed i.p.v. op het bronelement: zo komt `pointerup`/`pointercancel`
  // altijd aan, ook als de vinger het bronvak al verlaten heeft.
  useEffect(() => {
    if (dragSpelerId === null) {
      return
    }
    const spelerId = dragSpelerId
    const start = dragStartRef.current
    let onderPositie: string | null = null
    // Blijft aan zodra de drempel één keer gehaald is (ook als de vinger
    // daarna weer dichtbij het startpunt komt) — voorkomt dat een tik met
    // drempel-jitter alsnog een drop-target oplevert.
    let sleepActief = false

    // Touch geeft impliciete pointer capture aan het bronelement (Pointer
    // Events-spec): `pointerenter`/`leave` vuren dan niet voor vakken waar de
    // vinger overheen beweegt. Hit-testen op coördinaten werkt wel altijd.
    function handlePointerMove(event: globalThis.PointerEvent) {
      if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) >= GHOST_ACTIVATIE_PX) {
        sleepActief = true
        setDragPos({ x: event.clientX, y: event.clientY })
      }
      if (!sleepActief) {
        return
      }
      const onder = document.elementFromPoint(event.clientX, event.clientY)
      const vak = onder instanceof Element ? onder.closest<HTMLElement>('.opstelling-vak') : null
      onderPositie = vak?.dataset.positie ?? null
    }

    function eindigSleep() {
      if (onderPositie) {
        void plaatsSpeler(onderPositie, spelerId)
      }
      setDragSpelerId(null)
      setDragPos(null)
    }

    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', eindigSleep)
    document.addEventListener('pointercancel', eindigSleep)
    return () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', eindigSleep)
      document.removeEventListener('pointercancel', eindigSleep)
    }
  }, [dragSpelerId, plaatsSpeler])

  function vindSpeler(spelerId: string | undefined): Speler | undefined {
    return spelerId ? aanwezig.find((speler) => speler.id === spelerId) : undefined
  }

  return (
    <section className="opstelling-screen">
      <h4>Opstelling — kwart {kwart}</h4>

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
              const score = beoordelingen[slot.naam]?.score
              return (
                <button
                  key={slot.id}
                  type="button"
                  className={`opstelling-vak${speler ? ' bezet' : ' leeg'}`}
                  style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                  aria-label={`${slot.naam}: ${speler ? speler.naam : 'leeg'}`}
                  data-positie={slot.naam}
                  onPointerDown={(event) => speler && handleDragPointerDown(event, speler.id)}
                  onClick={() => handleSlotTap(slot.naam)}
                >
                  <span className="opstelling-vak-positie">{slot.naam}</span>
                  <span className="opstelling-vak-naam">{speler ? speler.naam : '—'}</span>
                  {score ? <span className="opstelling-vak-score">★{score}</span> : null}
                </button>
              )
            })}
          </div>

          <div className="opstelling-wisselbank">
            {/* aria-live: kondigt een wijzigende wisselbank hardop aan zonder een aparte melding (jt-dvh.14.16). */}
            <h5 aria-live="polite">Wisselbank ({wisselbank.length})</h5>
            <ul>
              {wisselbank.map((speler) => (
                <li key={speler.id}>
                  <button
                    type="button"
                    onPointerDown={(event) => handleDragPointerDown(event, speler.id)}
                    onClick={() => handleBenchTap(speler.id)}
                    aria-pressed={selectedBenchSpelerId === speler.id}
                  >
                    {speler.naam}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {dragSpelerId && dragPos && (
            <div className="opstelling-drag-ghost" inert style={{ left: dragPos.x, top: dragPos.y }}>
              {vindSpeler(dragSpelerId)?.naam}
            </div>
          )}

          {beoordeelPositie && (
            <div className="opstelling-beoordeling-sheet" role="dialog" aria-label={`Beoordeling ${beoordeelPositie}`}>
              <h5>Beoordeling — {vindSpeler(opstelling[beoordeelPositie])?.naam ?? beoordeelPositie}</h5>

              <div role="radiogroup" aria-label="Score (1-5 sterren)">
                {[1, 2, 3, 4, 5].map((ster) => (
                  <button
                    key={ster}
                    type="button"
                    role="radio"
                    aria-checked={scoreBuffer === ster}
                    aria-label={ster === 1 ? '1 ster' : `${ster} sterren`}
                    onClick={() => setScoreBuffer(ster)}
                  >
                    {scoreBuffer !== null && ster <= scoreBuffer ? '★' : '☆'}
                  </button>
                ))}
              </div>

              <label htmlFor="opstelling-beoordeling-opmerking">Opmerking</label>
              <textarea
                id="opstelling-beoordeling-opmerking"
                value={opmerkingBuffer}
                onChange={(event) => setOpmerkingBuffer(event.target.value)}
              />

              <button type="button" onClick={() => void handleBeoordelingKlaar()}>
                Klaar
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
