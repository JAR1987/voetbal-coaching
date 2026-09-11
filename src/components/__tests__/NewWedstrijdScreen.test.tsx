import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { WedstrijdService } from '../../data/wedstrijdService'
import { NewWedstrijdScreen } from '../NewWedstrijdScreen'

/** Happy path (create + navigate) is covered by `WedstrijdScreen.test.tsx`;
 * this file covers only jt-dvh.14.16's additions: field hygiene + error-focus. */
function fakeWedstrijdService(overrides: Partial<WedstrijdService> = {}): WedstrijdService {
  return {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    updateKwartDuur: vi.fn(),
    updateWedstrijdgegevens: vi.fn(),
    ...overrides,
  }
}

describe('NewWedstrijdScreen', () => {
  it('has a name attribute and a deliberate autoComplete value on the datum field', () => {
    render(
      <MemoryRouter>
        <NewWedstrijdScreen wedstrijdService={fakeWedstrijdService()} teamId="team-1" onCreated={vi.fn()} />
      </MemoryRouter>,
    )

    const datumInput = screen.getByLabelText('Datum')
    expect(datumInput).toHaveAttribute('name', 'datum')
    expect(datumInput).toHaveAttribute('autoComplete', 'off')
  })

  it('moves focus to the datum field on a create error, instead of only showing red text', async () => {
    const user = userEvent.setup()
    const wedstrijdService = fakeWedstrijdService({
      create: vi.fn().mockRejectedValue(new Error('constraint schending')),
    })
    render(
      <MemoryRouter>
        <NewWedstrijdScreen wedstrijdService={wedstrijdService} teamId="team-1" onCreated={vi.fn()} />
      </MemoryRouter>,
    )
    const datumInput = screen.getByLabelText('Datum')
    fireEvent.change(datumInput, { target: { value: '2026-09-20' } })

    await user.click(screen.getByRole('button', { name: /wedstrijd aanmaken/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/niet gelukt/i)
    await waitFor(() => expect(datumInput).toHaveFocus())
  })
})
