import type { AuthService } from './data/authService'
import type { TeamService } from './data/teamService'
import type { SpelerService } from './data/spelerService'
import type { WedstrijdService } from './data/wedstrijdService'
import type { AanwezigheidService } from './data/aanwezigheidService'
import { useSession } from './hooks/useSession'
import { LoginScreen } from './components/LoginScreen'
import { HomeScreen } from './components/HomeScreen'
import './App.css'

export interface AppProps {
  authService: AuthService
  teamService: TeamService
  spelerService: SpelerService
  wedstrijdService: WedstrijdService
  aanwezigheidService: AanwezigheidService
}

/**
 * Top-level screen switch: logged-out coaches always see the login screen,
 * logged-in coaches see the home screen (team + player list + matches). No
 * router yet — there's only one real screen so far, later tickets can
 * introduce one once there's somewhere else to navigate to.
 */
export function App({ authService, teamService, spelerService, wedstrijdService, aanwezigheidService }: AppProps) {
  const { session, loading } = useSession(authService)

  if (loading) {
    return (
      <main className="screen app-loading">
        <p>Laden…</p>
      </main>
    )
  }

  return session ? (
    <HomeScreen
      authService={authService}
      teamService={teamService}
      spelerService={spelerService}
      wedstrijdService={wedstrijdService}
      aanwezigheidService={aanwezigheidService}
    />
  ) : (
    <LoginScreen authService={authService} />
  )
}

export default App
