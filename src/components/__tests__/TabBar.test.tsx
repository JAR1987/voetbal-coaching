import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TabBar } from '../TabBar'

function renderTabBar(initialEntries: string[]) {
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <TabBar />
    </MemoryRouter>,
  )
}

describe('TabBar', () => {
  it('shows Spelers, Wedstrijden and Dashboard as top-level links', () => {
    renderTabBar(['/wedstrijden'])

    expect(screen.getByRole('link', { name: 'Spelers' })).toHaveAttribute('href', '/spelers')
    expect(screen.getByRole('link', { name: 'Wedstrijden' })).toHaveAttribute('href', '/wedstrijden')
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard')
  })

  it('marks the Dashboard link active only when on /dashboard', () => {
    renderTabBar(['/dashboard'])

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveClass('actief')
    expect(screen.getByRole('link', { name: 'Spelers' })).not.toHaveClass('actief')
    expect(screen.getByRole('link', { name: 'Wedstrijden' })).not.toHaveClass('actief')
  })

  it('shows an icon next to each label', () => {
    renderTabBar(['/spelers'])

    for (const name of ['Spelers', 'Wedstrijden', 'Dashboard']) {
      expect(screen.getByRole('link', { name }).querySelector('svg')).not.toBeNull()
    }
  })
})
