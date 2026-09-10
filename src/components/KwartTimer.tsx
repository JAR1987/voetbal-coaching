import { useEffect, useRef, useState } from 'react'
import type { WedstrijdService } from '../data/wedstrijdService'
import type { Wedstrijd } from '../data/types'

type TimerStatus = 'gestopt' | 'lopend' | 'gepauzeerd' | 'afgelopen'

const TICK_MS = 250
const STAP_SECONDEN = 60
const MIN_DUUR_SECONDEN = 60

/** Identiteit van "welke wedstrijd/duur is momenteel gesynchroniseerd" —
 * vergeleken tijdens render (zie `KwartTimer` hieronder), niet in een effect. */
function syncSleutel(wedstrijd: Wedstrijd): string {
  return `${wedstrijd.id}:${wedstrijd.kwartDuurSeconden}`
}

function formatDuur(totaalSeconden: number): string {
  const seconden = Math.max(0, Math.round(totaalSeconden))
  const minuten = Math.floor(seconden / 60)
  const rest = seconden % 60
  return `${minuten}:${rest.toString().padStart(2, '0')}`
}

/** Korte pieptoon (Web Audio API, geen bundled asset) + trilling; beide zijn
 * best-effort naast de schermbanner — een ontbrekende AudioContext of
 * `navigator.vibrate` (o.a. iOS Safari/desktop) mag nooit blokkeren. */
function speelAlert(): void {
  try {
    if (typeof AudioContext !== 'undefined') {
      const ctx = new AudioContext()
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      oscillator.frequency.value = 880
      gain.gain.value = 0.2
      oscillator.connect(gain)
      gain.connect(ctx.destination)
      oscillator.start()
      oscillator.stop(ctx.currentTime + 0.4)
    }
  } catch {
    // Geluid is een bonus bovenop de schermmelding, geen harde vereiste.
  }

  try {
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 200])
    }
  } catch {
    // Zelfde reden als hierboven.
  }
}

interface KwartTimerProps {
  wedstrijd: Wedstrijd
  wedstrijdService: WedstrijdService
}

/** Kwart-timer (jt-dvh.14.8): duur aanpasbaar en persistent per wedstrijd,
 * handmatig start/pauze/hervat, melding (geluid+trilling+scherm) bij einde.
 * Telt terug vanaf een startmoment (`Date.now()`) i.p.v. pure ticks, om drift te vermijden. */
export function KwartTimer({ wedstrijd, wedstrijdService }: KwartTimerProps) {
  const [duurSeconden, setDuurSeconden] = useState(wedstrijd.kwartDuurSeconden)
  const [resterendeSeconden, setResterendeSeconden] = useState(wedstrijd.kwartDuurSeconden)
  const [status, setStatus] = useState<TimerStatus>('gestopt')
  const [savingDuur, setSavingDuur] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncedSleutel, setSyncedSleutel] = useState(() => syncSleutel(wedstrijd))

  const startedAtRef = useRef<number | null>(null)
  const resterendBijStartRef = useRef(resterendeSeconden)

  // Andere wedstrijd (geen key-reset in MatchDetailScreen): state-afgeleid-
  // van-props, dus bijwerken tijdens render i.p.v. via een effect (zie
  // jt-dvh.14.8 bead-notes voor de volledige afweging).
  if (syncSleutel(wedstrijd) !== syncedSleutel) {
    setSyncedSleutel(syncSleutel(wedstrijd))
    setDuurSeconden(wedstrijd.kwartDuurSeconden)
    setResterendeSeconden(wedstrijd.kwartDuurSeconden)
    setStatus('gestopt')
  }

  useEffect(() => {
    if (status !== 'lopend') {
      return
    }
    const interval = setInterval(() => {
      const startedAt = startedAtRef.current
      if (startedAt === null) {
        return
      }
      const verstreken = (Date.now() - startedAt) / 1000
      const nieuw = Math.max(0, resterendBijStartRef.current - verstreken)
      setResterendeSeconden(nieuw)
      if (nieuw <= 0) {
        setStatus('afgelopen')
        speelAlert()
      }
    }, TICK_MS)
    return () => clearInterval(interval)
  }, [status])

  function handleStart() {
    startedAtRef.current = Date.now()
    resterendBijStartRef.current = resterendeSeconden
    setStatus('lopend')
  }

  function handlePauzeren() {
    setStatus('gepauzeerd')
  }

  function handleReset() {
    setResterendeSeconden(duurSeconden)
    setStatus('gestopt')
  }

  async function handleDuurWijzigen(stappen: number) {
    const nieuweDuur = Math.max(MIN_DUUR_SECONDEN, duurSeconden + stappen * STAP_SECONDEN)
    setSavingDuur(true)
    setError(null)
    try {
      const bijgewerkt = await wedstrijdService.updateKwartDuur(wedstrijd.id, nieuweDuur)
      setDuurSeconden(bijgewerkt.kwartDuurSeconden)
      if (status === 'gestopt') {
        setResterendeSeconden(bijgewerkt.kwartDuurSeconden)
      }
    } catch {
      setError('Kwartduur aanpassen is niet gelukt.')
    } finally {
      setSavingDuur(false)
    }
  }

  return (
    <section className="kwart-timer" aria-label="Kwart-timer">
      <h4>Kwart-timer</h4>

      {error && (
        <p role="alert" className="kwart-timer-error">
          {error}
        </p>
      )}

      <div className="kwart-timer-duur">
        <span>Standaardduur: {formatDuur(duurSeconden)}</span>
        <button
          type="button"
          onClick={() => handleDuurWijzigen(-1)}
          disabled={savingDuur || duurSeconden <= MIN_DUUR_SECONDEN}
        >
          -1 min
        </button>
        <button type="button" onClick={() => handleDuurWijzigen(1)} disabled={savingDuur}>
          +1 min
        </button>
      </div>

      <div
        className={status === 'afgelopen' ? 'kwart-timer-countdown kwart-timer-afgelopen' : 'kwart-timer-countdown'}
        role="timer"
        aria-live="polite"
      >
        {status === 'afgelopen' ? 'Kwart afgelopen!' : formatDuur(resterendeSeconden)}
      </div>

      <div className="kwart-timer-controls">
        {status === 'gestopt' && (
          <button type="button" onClick={handleStart}>
            Start
          </button>
        )}
        {status === 'lopend' && (
          <button type="button" onClick={handlePauzeren}>
            Pauzeer
          </button>
        )}
        {status === 'gepauzeerd' && (
          <button type="button" onClick={handleStart}>
            Hervat
          </button>
        )}
        {status === 'afgelopen' && (
          <button type="button" onClick={handleReset}>
            Reset
          </button>
        )}
      </div>
    </section>
  )
}
