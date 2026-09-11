import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Speler } from '../../data/types'
import type { SpelerService, NewSpelerInput, SpelerUpdateInput } from '../../data/spelerService'
import { PlayerListScreen } from '../PlayerListScreen'

/**
 * A lightweight in-memory fake of SpelerService, backed by an array instead
 * of Supabase — lets these tests drive real add/edit/deactivate flows
 * through the UI without asserting on individual mock call plumbing (that's
 * what src/data/__tests__/spelerService.test.ts already covers).
 */
function createFakeSpelerService(initial: Speler[] = []): SpelerService {
  let rows = [...initial]
  let nextId = initial.length + 1

  return {
    list: vi.fn(async (teamId: string, options: { includeInactive?: boolean } = {}) => {
      return rows
        .filter((p) => p.teamId === teamId)
        .filter((p) => options.includeInactive || p.status === 'actief')
        .sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))
    }),
    create: vi.fn(async (input: NewSpelerInput) => {
      const naam = input.naam.trim()
      if (!naam) {
        throw new Error('Naam is verplicht.')
      }
      const speler: Speler = {
        id: `s${nextId++}`,
        teamId: input.teamId,
        naam,
        rugnummer: input.rugnummer ?? null,
        opmerkingen: input.opmerkingen ?? null,
        status: 'actief',
        createdAt: '2026-01-01T00:00:00Z',
      }
      rows = [...rows, speler]
      return speler
    }),
    update: vi.fn(async (id: string, changes: SpelerUpdateInput) => {
      const idx = rows.findIndex((p) => p.id === id)
      if (idx === -1) {
        throw new Error('Speler niet gevonden.')
      }
      const updated = { ...rows[idx], ...changes }
      rows = rows.map((p) => (p.id === id ? updated : p))
      return updated
    }),
    setStatus: vi.fn(async (id: string, status: 'actief' | 'inactief') => {
      const idx = rows.findIndex((p) => p.id === id)
      if (idx === -1) {
        throw new Error('Speler niet gevonden.')
      }
      const updated = { ...rows[idx], status }
      rows = rows.map((p) => (p.id === id ? updated : p))
      return updated
    }),
  }
}

describe('PlayerListScreen', () => {
  it('adds a new player and shows it in the active list', async () => {
    const user = userEvent.setup()
    const spelerService = createFakeSpelerService()
    render(<PlayerListScreen spelerService={spelerService} teamId="team-1" />)

    await waitFor(() => expect(screen.getByText(/nog geen spelers/i)).toBeInTheDocument())

    await user.type(screen.getByLabelText('Naam'), 'Jan Jansen')
    await user.type(screen.getByLabelText('Rugnummer'), '9')
    await user.click(screen.getByRole('button', { name: /speler toevoegen/i }))

    expect(await screen.findByText(/jan jansen/i)).toBeInTheDocument()
    expect(spelerService.create).toHaveBeenCalledWith({
      teamId: 'team-1',
      naam: 'Jan Jansen',
      rugnummer: 9,
      opmerkingen: null,
    })
  })

  it('rejects adding a player without a naam (required field, enforced by the form)', async () => {
    const spelerService = createFakeSpelerService()
    render(<PlayerListScreen spelerService={spelerService} teamId="team-1" />)
    await waitFor(() => expect(screen.getByText(/nog geen spelers/i)).toBeInTheDocument())

    const naamInput = screen.getByLabelText('Naam') as HTMLInputElement
    expect(naamInput).toBeRequired()
  })

  it('hides a deactivated player from the active list, but it stays visible (and reactivatable) via the inactive toggle', async () => {
    const user = userEvent.setup()
    const existing: Speler = {
      id: 's1',
      teamId: 'team-1',
      naam: 'Piet Peters',
      rugnummer: 5,
      opmerkingen: null,
      status: 'actief',
      createdAt: '2026-01-01T00:00:00Z',
    }
    const spelerService = createFakeSpelerService([existing])
    render(<PlayerListScreen spelerService={spelerService} teamId="team-1" />)

    expect(await screen.findByText(/piet peters/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /zet inactief/i }))

    await waitFor(() => expect(screen.queryByText(/piet peters/i)).not.toBeInTheDocument())
    expect(spelerService.setStatus).toHaveBeenCalledWith('s1', 'inactief')

    // Nothing was deleted: the data layer still has the row, and toggling
    // "toon inactieve spelers" fetches it back (with its status label).
    await user.click(screen.getByLabelText(/toon inactieve spelers/i))

    expect(await screen.findByText(/piet peters/i)).toBeInTheDocument()
    expect(screen.getByText(/inactief/i)).toBeInTheDocument()

    // And it can be set active again from there.
    await user.click(screen.getByRole('button', { name: /zet actief/i }))
    expect(spelerService.setStatus).toHaveBeenCalledWith('s1', 'actief')
  })

  it('has name attributes and a deliberate autoComplete value on the naam/rugnummer/opmerkingen fields', async () => {
    const spelerService = createFakeSpelerService()
    render(<PlayerListScreen spelerService={spelerService} teamId="team-1" />)
    await waitFor(() => expect(screen.getByText(/nog geen spelers/i)).toBeInTheDocument())

    expect(screen.getByLabelText('Naam')).toHaveAttribute('name', 'naam')
    expect(screen.getByLabelText('Naam')).toHaveAttribute('autoComplete', 'off')
    expect(screen.getByLabelText('Rugnummer')).toHaveAttribute('name', 'rugnummer')
    expect(screen.getByLabelText('Rugnummer')).toHaveAttribute('autoComplete', 'off')
    expect(screen.getByLabelText('Opmerkingen')).toHaveAttribute('name', 'opmerkingen')
    expect(screen.getByLabelText('Opmerkingen')).toHaveAttribute('autoComplete', 'off')
  })

  it('moves focus to the naam field when adding a player fails, instead of only showing red text', async () => {
    const user = userEvent.setup()
    const spelerService = createFakeSpelerService()
    spelerService.create = vi.fn().mockRejectedValue(new Error('constraint schending'))
    render(<PlayerListScreen spelerService={spelerService} teamId="team-1" />)
    await waitFor(() => expect(screen.getByText(/nog geen spelers/i)).toBeInTheDocument())

    const naamInput = screen.getByLabelText('Naam')
    await user.type(naamInput, 'Jan Jansen')
    await user.click(screen.getByRole('button', { name: /speler toevoegen/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/niet gelukt/i)
    await waitFor(() => expect(naamInput).toHaveFocus())
  })

  it('moves focus to the naam field when editing a player fails, instead of only showing red text', async () => {
    const user = userEvent.setup()
    const existing: Speler = {
      id: 's1',
      teamId: 'team-1',
      naam: 'Kees Klaassen',
      rugnummer: 3,
      opmerkingen: null,
      status: 'actief',
      createdAt: '2026-01-01T00:00:00Z',
    }
    const spelerService = createFakeSpelerService([existing])
    spelerService.update = vi.fn().mockRejectedValue(new Error('constraint schending'))
    render(<PlayerListScreen spelerService={spelerService} teamId="team-1" />)
    expect(await screen.findByText(/kees klaassen/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /bewerken/i }))
    const editForm = screen.getByRole('form', { name: /kees klaassen bewerken/i })
    const naamInput = within(editForm).getByLabelText('Naam')
    await user.click(within(editForm).getByRole('button', { name: /opslaan/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/niet gelukt/i)
    await waitFor(() => expect(naamInput).toHaveFocus())
  })

  it('renders an artificially long naam/opmerkingen without erroring (layout truncation itself is CSS-only, see App.css)', async () => {
    const langeNaam = 'A'.repeat(200)
    const langeOpmerking = 'B'.repeat(500)
    const existing: Speler = {
      id: 's1',
      teamId: 'team-1',
      naam: langeNaam,
      rugnummer: null,
      opmerkingen: langeOpmerking,
      status: 'actief',
      createdAt: '2026-01-01T00:00:00Z',
    }
    const spelerService = createFakeSpelerService([existing])
    render(<PlayerListScreen spelerService={spelerService} teamId="team-1" />)

    expect(await screen.findByText(langeNaam, { exact: false })).toHaveClass('player-name')
    expect(screen.getByText(langeOpmerking)).toHaveClass('player-notes')
  })

  it('edits an existing player and shows the updated fields', async () => {
    const user = userEvent.setup()
    const existing: Speler = {
      id: 's1',
      teamId: 'team-1',
      naam: 'Kees Klaassen',
      rugnummer: 3,
      opmerkingen: null,
      status: 'actief',
      createdAt: '2026-01-01T00:00:00Z',
    }
    const spelerService = createFakeSpelerService([existing])
    render(<PlayerListScreen spelerService={spelerService} teamId="team-1" />)

    expect(await screen.findByText(/kees klaassen/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /bewerken/i }))

    const editForm = screen.getByRole('form', { name: /kees klaassen bewerken/i })
    const naamInput = within(editForm).getByLabelText('Naam')
    const rugnummerInput = within(editForm).getByLabelText('Rugnummer')
    await user.clear(naamInput)
    await user.type(naamInput, 'Kees K.')
    await user.clear(rugnummerInput)
    await user.type(rugnummerInput, '7')
    await user.click(within(editForm).getByRole('button', { name: /opslaan/i }))

    expect(await screen.findByText(/kees k\./i)).toBeInTheDocument()
    expect(spelerService.update).toHaveBeenCalledWith('s1', {
      naam: 'Kees K.',
      rugnummer: 7,
      opmerkingen: null,
    })
  })
})
