import { useState } from 'react'
import { bouwOpstellingAfbeelding, canvasNaarBlob } from '../data/opstellingAfbeelding'
import type { OpstellingService } from '../data/opstellingService'
import type { SpelerService } from '../data/spelerService'
import type { Wedstrijd } from '../data/types'

interface DeelOpstellingKnopProps {
  wedstrijd: Wedstrijd
  teamId: string
  /** Kwart dat op dat moment bekeken wordt — eigendom van `MatchDetailScreen`. */
  kwart: number
  opstellingService: OpstellingService
  spelerService: SpelerService
}

/** Deelt de opstelling van het actieve kwart als afbeelding via het
 * systeem-deelmenu (jt-dvh.14.9) — geen eigen WhatsApp/e-mail-integratie, de
 * hele afhandeling na het maken van de afbeelding is `navigator.share`. */
export function DeelOpstellingKnop({ wedstrijd, teamId, kwart, opstellingService, spelerService }: DeelOpstellingKnopProps) {
  const [bezig, setBezig] = useState(false)
  const [melding, setMelding] = useState<string | null>(null)

  async function handleDelen() {
    setBezig(true)
    setMelding(null)
    try {
      if (typeof navigator.share !== 'function') {
        setMelding('Delen wordt niet ondersteund op dit toestel/deze browser.')
        return
      }

      const { canvas, data } = await bouwOpstellingAfbeelding({ wedstrijd, kwart, teamId, opstellingService, spelerService })
      const blob = await canvasNaarBlob(canvas)
      const file = new File([blob], `opstelling-kwart-${kwart}.png`, { type: 'image/png' })

      if (!navigator.canShare?.({ files: [file] })) {
        setMelding('Delen wordt niet ondersteund op dit toestel/deze browser.')
        return
      }

      await navigator.share({ files: [file], title: data.titel, text: `${data.titel} — ${data.ondertitel}` })
    } catch (error) {
      // De coach die het systeem-deelmenu sluit is geen fout.
      if ((error as DOMException)?.name !== 'AbortError') {
        setMelding('Opstelling delen is niet gelukt.')
      }
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="deel-opstelling">
      <button type="button" onClick={() => void handleDelen()} disabled={bezig}>
        {bezig ? 'Afbeelding maken…' : 'Deel opstelling'}
      </button>
      {melding && (
        <p role="alert" className="deel-opstelling-melding">
          {melding}
        </p>
      )}
    </div>
  )
}
