import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Wedstrijd } from '../../data/types'
import type { WedstrijdgegevensInput, WedstrijdService } from '../../data/wedstrijdService'
import { WedstrijdGegevensScreen } from '../WedstrijdGegevensScreen'

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
  kwartDuurSeconden: 1200,
  createdAt: '2026-01-01T00:00:00Z',
}

function fakeWedstrijdService(overrides: Partial<WedstrijdService> = {}): WedstrijdService {
  return {
    list: vi.fn(),
    create: vi.fn(),
    updateKwartDuur: vi.fn(),
    updateWedstrijdgegevens: vi.fn(async (_id: string, gegevens: WedstrijdgegevensInput) => ({
      ...wedstrijd,
      ...gegevens,
    })),
    ...overrides,
  }
}

describe('WedstrijdGegevensScreen', () => {
  it('shows every field empty and none required when the match has no gegevens yet', () => {
    render(<WedstrijdGegevensScreen wedstrijd={wedstrijd} wedstrijdService={fakeWedstrijdService()} onWedstrijdUpdated={vi.fn()} />)

    expect(screen.getByLabelText('Tegenstander')).toHaveValue('')
    expect(screen.getByLabelText('Tegenstander')).not.toBeRequired()
    expect(screen.getByLabelText('Thuis/uit')).toHaveValue('')
    expect(screen.getByLabelText('Thuis/uit')).not.toBeRequired()
    expect(screen.getByLabelText('Eigen score')).toHaveValue(null)
    expect(screen.getByLabelText('Eigen score')).not.toBeRequired()
    expect(screen.getByLabelText('Tegen score')).toHaveValue(null)
    expect(screen.getByLabelText('Tegen score')).not.toBeRequired()
  })

  it('shows previously saved gegevens pre-filled', () => {
    const gevuld: Wedstrijd = { ...wedstrijd, tegenstander: 'FC Voorbeeld', thuisUit: 'uit', eigenScore: 2, tegenScore: 2 }
    render(<WedstrijdGegevensScreen wedstrijd={gevuld} wedstrijdService={fakeWedstrijdService()} onWedstrijdUpdated={vi.fn()} />)

    expect(screen.getByLabelText('Tegenstander')).toHaveValue('FC Voorbeeld')
    expect(screen.getByLabelText('Thuis/uit')).toHaveValue('uit')
    expect(screen.getByLabelText('Eigen score')).toHaveValue(2)
    expect(screen.getByLabelText('Tegen score')).toHaveValue(2)
  })

  it('saves the filled-in fields and reports success', async () => {
    const user = userEvent.setup()
    const onWedstrijdUpdated = vi.fn()
    const wedstrijdService = fakeWedstrijdService()
    render(
      <WedstrijdGegevensScreen wedstrijd={wedstrijd} wedstrijdService={wedstrijdService} onWedstrijdUpdated={onWedstrijdUpdated} />,
    )

    await user.type(screen.getByLabelText('Tegenstander'), 'FC Voorbeeld')
    await user.selectOptions(screen.getByLabelText('Thuis/uit'), 'thuis')
    await user.type(screen.getByLabelText('Eigen score'), '3')
    await user.type(screen.getByLabelText('Tegen score'), '1')
    await user.click(screen.getByRole('button', { name: /opslaan/i }))

    expect(await screen.findByText('Opgeslagen.')).toBeInTheDocument()
    expect(wedstrijdService.updateWedstrijdgegevens).toHaveBeenCalledWith('w1', {
      tegenstander: 'FC Voorbeeld',
      thuisUit: 'thuis',
      eigenScore: 3,
      tegenScore: 1,
    })
    expect(onWedstrijdUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ tegenstander: 'FC Voorbeeld', thuisUit: 'thuis', eigenScore: 3, tegenScore: 1 }),
    )
  })

  it('submits all nulls when every field is left blank — nothing here is required', async () => {
    const user = userEvent.setup()
    const wedstrijdService = fakeWedstrijdService()
    render(<WedstrijdGegevensScreen wedstrijd={wedstrijd} wedstrijdService={wedstrijdService} onWedstrijdUpdated={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /opslaan/i }))

    expect(await screen.findByText('Opgeslagen.')).toBeInTheDocument()
    expect(wedstrijdService.updateWedstrijdgegevens).toHaveBeenCalledWith('w1', {
      tegenstander: null,
      thuisUit: null,
      eigenScore: null,
      tegenScore: null,
    })
  })

  it('shows an error and does not report success when saving fails', async () => {
    const user = userEvent.setup()
    const onWedstrijdUpdated = vi.fn()
    const wedstrijdService = fakeWedstrijdService({
      updateWedstrijdgegevens: vi.fn().mockRejectedValue(new Error('nope')),
    })
    render(
      <WedstrijdGegevensScreen wedstrijd={wedstrijd} wedstrijdService={wedstrijdService} onWedstrijdUpdated={onWedstrijdUpdated} />,
    )

    await user.click(screen.getByRole('button', { name: /opslaan/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/niet gelukt/i)
    expect(onWedstrijdUpdated).not.toHaveBeenCalled()
    expect(screen.queryByText('Opgeslagen.')).not.toBeInTheDocument()
  })
})
