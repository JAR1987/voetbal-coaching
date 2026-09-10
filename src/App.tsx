import type { AuthService } from './data/authService'
import type { TeamService } from './data/teamService'
import type { SpelerService } from './data/spelerService'
import type { WedstrijdService } from './data/wedstrijdService'
import type { AanwezigheidService } from './data/aanwezigheidService'
import type { OpstellingService } from './data/opstellingService'
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
  opstellingService: OpstellingService
}

/**
 * Top-level screen switch: logged-out coaches always see the login screen,
 * logged-in coaches see the home screen (team + player list + matches). No
 * router yet — there's only one real screen so far, later tickets can
 * introduce one once there's somewhere else to navigate to.
 */
export function App({ authService, teamService, spelerService, wedstrijdService, aanwezigheidService, opstellingService }: AppProps) {
  const { session, loading } = useSession(authService)

  if (loading) {
    return (
      <main className="screen app-loading">
        <p>Laden…</p>
      </main>
    )
  }

  return (
    <>
      {session ? (
        <HomeScreen
          authService={authService}
          teamService={teamService}
          spelerService={spelerService}
          wedstrijdService={wedstrijdService}
          aanwezigheidService={aanwezigheidService}
          opstellingService={opstellingService}
        />
      ) : (
        <LoginScreen authService={authService} />
      )}
      <p className="build-info">v{__APP_VERSION__}</p>
    </>
  )
}

export default App
