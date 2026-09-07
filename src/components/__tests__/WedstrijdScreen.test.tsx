import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Wedstrijd } from '../../data/types'
import { DEFAULT_FORMATIE } from '../../data/types'
import type { NewWedstrijdInput, WedstrijdService } from '../../data/wedstrijdService'
import { WedstrijdScreen } from '../WedstrijdScreen'

/**
 * A lightweight in-memory fake of WedstrijdService, backed by a map instead
 * of Supabase/seizoenService — lets these tests drive the real
 * create-a-match-and-see-it-appear flow through the UI without asserting on
 * individual mock call plumbing (that's what
 * src/data/__tests__/wedstrijdService.test.ts already covers). Mirrors the
 * behaviour of the real service (defaulting formatie per formaat) closely
 * enough for that purpose without needing a real season.
 */
function createFakeWedstrijdService(): WedstrijdService {
  const byTeam = new Map<string, Wedstrijd[]>()
  let nextId = 1

  return {
    list: vi.fn(async (teamId: string) => byTeam.get(teamId) ?? []),
    create: vi.fn(async (input: NewWedstrijdInput) => {
      const wedstrijd: Wedstrijd = {
        id: `w${nextId++}`,
        seizoenId: 'seizoen-fake',
        datum: input.datum,
        formaat: input.formaat,
        formatie: input.formatie ?? DEFAULT_FORMATIE[input.formaat],
        tegenstander: input.tegenstander ?? null,
        eigenScore: input.eigenScore ?? null,
        tegenScore: input.tegenScore ?? null,
        thuisUit: input.thuisUit ?? null,
        createdAt: '2026-01-01T00:00:00Z',
      }
      byTeam.set(input.teamId, [...(byTeam.get(input.teamId) ?? []), wedstrijd])
      return wedstrijd
    }),
  }
}

describe('WedstrijdScreen', () => {
  it('offers 1-3-3-1 (preselected) and 1-2-3-2 for 8-tegen-8, the default formaat', async () => {
    render(<WedstrijdScreen wedstrijdService={createFakeWedstrijdService()} teamId="team-1" />)
    await screen.findByText(/nog geen wedstrijden/i)

    const formatieSelect = screen.getByLabelText('Formatie') as HTMLSelectElement
    const options = Array.from(formatieSelect.options).map((option) => option.value)

    expect(options).toEqual(['1-3-3-1', '1-2-3-2'])
    expect(formatieSelect.value).toBe('1-3-3-1')
  })

  it('switches the formatie options to 1-4-3-3 (preselected) and 1-4-4-2 when 11-tegen-11 is picked', async () => {
    const user = userEvent.setup()
    render(<WedstrijdScreen wedstrijdService={createFakeWedstrijdService()} teamId="team-1" />)
    await screen.findByText(/nog geen wedstrijden/i)

    await user.selectOptions(screen.getByLabelText('Formaat'), '11v11')

    const formatieSelect = screen.getByLabelText('Formatie') as HTMLSelectElement
    const options = Array.from(formatieSelect.options).map((option) => option.value)

    expect(options).toEqual(['1-4-3-3', '1-4-4-2'])
    expect(formatieSelect.value).toBe('1-4-3-3')
  })

  it('creates a match with only date + format filled in, and shows it in the list', async () => {
    const user = userEvent.setup()
    const wedstrijdService = createFakeWedstrijdService()
    render(<WedstrijdScreen wedstrijdService={wedstrijdService} teamId="team-1" />)
    await screen.findByText(/nog geen wedstrijden/i)

    fireEvent.change(screen.getByLabelText('Datum'), { target: { value: '2026-09-20' } })
    await user.click(screen.getByRole('button', { name: /wedstrijd aanmaken/i }))

    expect(await screen.findByText(/2026-09-20/)).toBeInTheDocument()
    expect(screen.getByRole('listitem')).toHaveTextContent('2026-09-20 — 8-tegen-8 — 1-3-3-1')
    expect(wedstrijdService.create).toHaveBeenCalledWith({
      teamId: 'team-1',
      datum: '2026-09-20',
      formaat: '8v8',
      formatie: '1-3-3-1',
    })
  })

  it('creates an 11-tegen-11 match with the alternative formation and shows it in the list', async () => {
    const user = userEvent.setup()
    const wedstrijdService = createFakeWedstrijdService()
    render(<WedstrijdScreen wedstrijdService={wedstrijdService} teamId="team-1" />)
    await screen.findByText(/nog geen wedstrijden/i)

    fireEvent.change(screen.getByLabelText('Datum'), { target: { value: '2026-03-14' } })
    await user.selectOptions(screen.getByLabelText('Formaat'), '11v11')
    await user.selectOptions(screen.getByLabelText('Formatie'), '1-4-4-2')
    await user.click(screen.getByRole('button', { name: /wedstrijd aanmaken/i }))

    expect(await screen.findByText(/1-4-4-2/)).toBeInTheDocument()
    expect(wedstrijdService.create).toHaveBeenCalledWith({
      teamId: 'team-1',
      datum: '2026-03-14',
      formaat: '11v11',
      formatie: '1-4-4-2',
    })
  })

  it('requires a date (enforced by the form)', async () => {
    render(<WedstrijdScreen wedstrijdService={createFakeWedstrijdService()} teamId="team-1" />)
    await screen.findByText(/nog geen wedstrijden/i)

    expect(screen.getByLabelText('Datum')).toBeRequired()
  })
})
