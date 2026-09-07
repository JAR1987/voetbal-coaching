import { useState } from 'react'
import type { FormEvent } from 'react'
import type { AuthService } from '../data/authService'

interface LoginScreenProps {
  authService: AuthService
}

export function LoginScreen({ authService }: LoginScreenProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await authService.signIn({ email, password })
      // On success, App's useSession picks up the new session (via
      // onAuthStateChange) and swaps this screen out — nothing to do here.
    } catch {
      setError('Inloggen is niet gelukt. Controleer je e-mailadres en wachtwoord.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="screen login-screen">
      <h1>Opstelling Coach</h1>
      <p>Log in met je coach-account.</p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="email">E-mailadres</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <label htmlFor="password">Wachtwoord</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        {error && (
          <p role="alert" className="login-error">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Bezig met inloggen…' : 'Inloggen'}
        </button>
      </form>
    </main>
  )
}
