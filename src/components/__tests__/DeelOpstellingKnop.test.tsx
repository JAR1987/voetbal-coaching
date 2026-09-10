import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { OpstellingMap, OpstellingService } from '../../data/opstellingService'
import type { SpelerService } from '../../data/spelerService'
import type { Speler, Wedstrijd } from '../../data/types'
import { DeelOpstellingKnop } from '../DeelOpstellingKnop'

const wedstrijd: Wedstrijd = {
  id: 'w1',
  seizoenId: 'seizoen-1',
  datum: '2026-03-14',
  formaat: '8v8',
  formatie: '1-3-3-1',
  tegenstander: null,
  eigenScore: null,
  tegenScore: null,
  thuisUit: null,
  kwartDuurSeconden: 1200,
  createdAt: '2026-01-01T00:00:00Z',
}

const jan: Speler = {
  id: 's1',
  teamId: 'team-1',
  naam: 'Jan Jansen',
  rugnummer: 9,
  opmerkingen: null,
  status: 'actief',
  createdAt: '2026-01-01T00:00:00Z',
}

const piet: Speler = {
  id: 's2',
  teamId: 'team-1',
  naam: 'Piet Peters',
  rugnummer: 5,
  opmerkingen: null,
  status: 'actief',
  createdAt: '2026-01-01T00:00:00Z',
}

function fakeOpstellingService(perKwart: Record<number, OpstellingMap>): OpstellingService {
  return {
    listForKwart: vi.fn(async (_wedstrijdId: string, kwart: number) => perKwart[kwart] ?? {}),
    placeSpeler: vi.fn(),
    cumulatieveSpeeltijdPerSpeler: vi.fn(),
    listBeoordelingenForKwart: vi.fn().mockResolvedValue({}),
    setBeoordeling: vi.fn(),
  }
}

function fakeSpelerService(): SpelerService {
  return { list: vi.fn().mockResolvedValue([jan, piet]), create: vi.fn(), update: vi.fn(), setStatus: vi.fn() }
}

let ctx: { fillText: ReturnType<typeof vi.fn>; fillRect: ReturnType<typeof vi.fn> }

beforeEach(() => {
  ctx = { fillText: vi.fn(), fillRect: vi.fn() }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
    callback(new Blob(['fake'], { type: 'image/png' })),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  delete (navigator as { share?: unknown }).share
  delete (navigator as { canShare?: unknown }).canShare
})

describe('DeelOpstellingKnop', () => {
  it('one tap builds an image and opens the system share sheet for the active kwart', async () => {
    const user = userEvent.setup()
    const share = vi.fn().mockResolvedValue(undefined)
    const canShare = vi.fn().mockReturnValue(true)
    navigator.share = share
    navigator.canShare = canShare

    const opstellingService = fakeOpstellingService({ 1: { Keeper: 's1' }, 2: { Spits: 's2' } })
    render(
      <DeelOpstellingKnop
        wedstrijd={wedstrijd}
        teamId="team-1"
        kwart={2}
        opstellingService={opstellingService}
        spelerService={fakeSpelerService()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /deel opstelling/i }))

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1))
    expect(opstellingService.listForKwart).toHaveBeenCalledWith('w1', 2)

    const [file] = canShare.mock.calls[0][0].files
    expect(file).toBeInstanceOf(File)
    const [shareArgs] = share.mock.calls[0]
    expect(shareArgs.files).toEqual([file])

    // Reflects kwart 2's opstelling (Spits: Piet Peters), not kwart 1's (Keeper: Jan Jansen).
    const teksten = ctx.fillText.mock.calls.map((call) => call[0])
    expect(teksten).toContain('Spits: Piet Peters')
    expect(teksten).toContain('Keeper: —')
    expect(teksten.join(' ')).not.toContain('Jan Jansen')
  })

  it('shows a clear message instead of throwing when sharing is not supported', async () => {
    const user = userEvent.setup()
    // navigator.share stays absent — the jsdom default for this ticket's "unsupported" path.

    render(
      <DeelOpstellingKnop
        wedstrijd={wedstrijd}
        teamId="team-1"
        kwart={1}
        opstellingService={fakeOpstellingService({ 1: {} })}
        spelerService={fakeSpelerService()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /deel opstelling/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/niet ondersteund/i)
  })

  it('also surfaces the message when navigator.canShare rejects this specific file', async () => {
    const user = userEvent.setup()
    navigator.share = vi.fn().mockResolvedValue(undefined)
    navigator.canShare = vi.fn().mockReturnValue(false)

    render(
      <DeelOpstellingKnop
        wedstrijd={wedstrijd}
        teamId="team-1"
        kwart={1}
        opstellingService={fakeOpstellingService({ 1: {} })}
        spelerService={fakeSpelerService()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /deel opstelling/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/niet ondersteund/i)
    expect(navigator.share).not.toHaveBeenCalled()
  })
})
