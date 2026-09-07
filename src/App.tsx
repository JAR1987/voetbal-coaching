import type { AuthService } from './data/authService'
import { useSession } from './hooks/useSession'
import { LoginScreen } from './components/LoginScreen'
import { HomeScreen } from './components/HomeScreen'
import './App.css'

export interface AppProps {
  authService: AuthService
}

/**
 * Top-level screen switch: logged-out coaches always see the login screen,
 * logged-in coaches see the (currently empty) home screen. No router yet —
 * there's only one real screen so far, later tickets can introduce one once
 * there's somewhere else to navigate to.
 */
export function App({ authService }: AppProps) {
  const { session, loading } = useSession(authService)

  if (loading) {
    return (
      <main className="screen app-loading">
        <p>Laden…</p>
      </main>
    )
  }

  return session ? <HomeScreen authService={authService} /> : <LoginScreen authService={authService} />
}

export default App
