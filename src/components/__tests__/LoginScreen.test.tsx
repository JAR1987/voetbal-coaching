import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session } from '@supabase/supabase-js'
import type { AuthService } from '../../data/authService'
import { LoginScreen } from '../LoginScreen'

function fakeAuthService(overrides: Partial<AuthService> = {}): AuthService {
  return {
    signIn: vi.fn().mockResolvedValue({ user: { id: 'coach-1' } } as unknown as Session),
    signOut: vi.fn(),
    getSession: vi.fn().mockResolvedValue(null),
    onAuthStateChange: vi.fn(() => () => {}),
    ...overrides,
  }
}

describe('LoginScreen', () => {
  it('calls authService.signIn with the entered credentials', async () => {
    const user = userEvent.setup()
    const authService = fakeAuthService()
    render(<LoginScreen authService={authService} />)

    await user.type(screen.getByLabelText(/e-mailadres/i), 'coach@example.com')
    await user.type(screen.getByLabelText(/wachtwoord/i), 'geheim123')
    await user.click(screen.getByRole('button', { name: /inloggen/i }))

    expect(authService.signIn).toHaveBeenCalledWith({
      email: 'coach@example.com',
      password: 'geheim123',
    })
  })

  it('shows a Dutch error message when sign-in is rejected, and does not crash', async () => {
    const user = userEvent.setup()
    const authService = fakeAuthService({
      signIn: vi.fn().mockRejectedValue(new Error('Invalid login credentials')),
    })
    render(<LoginScreen authService={authService} />)

    await user.type(screen.getByLabelText(/e-mailadres/i), 'coach@example.com')
    await user.type(screen.getByLabelText(/wachtwoord/i), 'fout-wachtwoord')
    await user.click(screen.getByRole('button', { name: /inloggen/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/niet gelukt/i)
  })
})
