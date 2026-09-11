import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { Wedstrijd } from '../../data/types'
import type { WedstrijdService } from '../../data/wedstrijdService'
import { KwartTimer } from '../KwartTimer'

const wedstrijd: Wedstrijd = {
  id: 'w1',
  seizoenId: 'seizoen-1',
  datum: '2026-09-20',
  formaat: '8v8',
  formatie: '1-3-3-1',
  tegenstander: null,
  eigenScore: null,
  tegenScore: null,
  thuisUit: null,
  kwartDuurSeconden: 120,
  createdAt: '2026-01-01T00:00:00Z',
}

function fakeWedstrijdService(overrides: Partial<WedstrijdService> = {}): WedstrijdService {
  return {
    list: vi.fn(),
    create: vi.fn(),
    updateKwartDuur: vi.fn(async (_wedstrijdId: string, seconden: number) => ({ ...wedstrijd, kwartDuurSeconden: seconden })),
    updateWedstrijdgegevens: vi.fn(),
    ...overrides,
  }
}

// jsdom heeft geen AudioContext/navigator.vibrate — stub ze zodat het
// aflopen van de timer (die beide aanroept) niet crasht in deze omgeving.
class FakeAudioContext {
  currentTime = 0
  createOscillator() {
    return { frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() }
  }
  createGain() {
    return { gain: { value: 0 }, connect: vi.fn() }
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('AudioContext', FakeAudioContext)
  Object.defineProperty(navigator, 'vibrate', { value: vi.fn(), configurable: true, writable: true })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// fireEvent i.p.v. userEvent: user-event v14's ingebouwde wachttijden botsen
// met vi.useFakeTimers (bekende beperking), fireEvent dispatcht synchroon.
describe('KwartTimer', () => {
  it('shows the match default duration and persists +/- adjustments via the service', async () => {
    const wedstrijdService = fakeWedstrijdService()
    render(<KwartTimer wedstrijd={wedstrijd} wedstrijdService={wedstrijdService} />)

    expect(screen.getByText('Standaardduur: 2:00')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+1 min' }))
    })

    expect(wedstrijdService.updateKwartDuur).toHaveBeenCalledWith('w1', 180)
    expect(screen.getByText('Standaardduur: 3:00')).toBeInTheDocument()
  })

  it('starts, pauzeert en hervat de countdown, tellend vanaf een startmoment', () => {
    render(<KwartTimer wedstrijd={wedstrijd} wedstrijdService={fakeWedstrijdService()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.getByRole('timer')).toHaveTextContent('1:55')

    fireEvent.click(screen.getByRole('button', { name: 'Pauzeer' }))
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    // Gepauzeerd: geen verdere aftelling ondanks verstreken tijd.
    expect(screen.getByRole('timer')).toHaveTextContent('1:55')

    fireEvent.click(screen.getByRole('button', { name: 'Hervat' }))
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.getByRole('timer')).toHaveTextContent('1:50')
  })

  it('meldt het aflopen van de timer op het scherm plus geluid/trilling', () => {
    render(<KwartTimer wedstrijd={{ ...wedstrijd, kwartDuurSeconden: 3 }} wedstrijdService={fakeWedstrijdService()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    act(() => {
      vi.advanceTimersByTime(3500)
    })

    expect(screen.getByRole('timer')).toHaveTextContent('Kwart afgelopen!')
    expect(navigator.vibrate).toHaveBeenCalled()
    // Reset-knop komt terug i.p.v. start/pauze, zodat de coach een nieuw kwart kan beginnen.
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument()
  })
})
