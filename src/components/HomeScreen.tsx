import type { AuthService } from '../data/authService'

interface HomeScreenProps {
  authService: AuthService
}

export function HomeScreen({ authService }: HomeScreenProps) {
  return (
    <main className="screen home-screen">
      <h1>Opstelling Coach</h1>
      <p>Je bent ingelogd. Hier komt binnenkort je team.</p>
      <button type="button" onClick={() => authService.signOut()}>
        Uitloggen
      </button>
    </main>
  )
}
