import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import type { AuthService } from '../data/authService'
import type { TeamService } from '../data/teamService'
import type { SpelerService } from '../data/spelerService'
import type { SeizoenService } from '../data/seizoenService'
import type { WedstrijdService } from '../data/wedstrijdService'
import type { AanwezigheidService } from '../data/aanwezigheidService'
import type { OpstellingService } from '../data/opstellingService'
import type { StatistiekenService } from '../data/statistiekenService'
import type { Team } from '../data/types'
import { PlayerListScreen } from './PlayerListScreen'
import { WedstrijdScreen } from './WedstrijdScreen'
import { DashboardScreen } from './DashboardScreen'
import { TabBar } from './TabBar'

interface HomeScreenProps {
  authService: AuthService
  teamService: TeamService
  spelerService: SpelerService
  seizoenService: SeizoenService
  wedstrijdService: WedstrijdService
  aanwezigheidService: AanwezigheidService
  opstellingService: OpstellingService
  statistiekenService: StatistiekenService
}

/**
 * Post-login layout: makes sure the coach's (single, for now) team exists —
 * creating it on first login if needed — then shows the fixed tab bar
 * (Spelers / Wedstrijden) with each section as its own route below it, via
 * `HomeScreen`'s own nested `<Routes>` (mounted at `/*` by `App`). See
 * `teamService.getOrCreateMyTeam` for the get-or-create logic; there's
 * deliberately no team-switcher or team-name editing UI yet, per the
 * ticket.
 */
export function HomeScreen({
  authService,
  teamService,
  spelerService,
  seizoenService,
  wedstrijdService,
  aanwezigheidService,
  opstellingService,
  statistiekenService,
}: HomeScreenProps) {
  const [team, setTeam] = useState<Team | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    teamService
      .getOrCreateMyTeam()
      .then((result) => {
        if (isMounted) {
          setTeam(result)
          setLoading(false)
        }
      })
      .catch(() => {
        if (isMounted) {
          setError('Team ophalen is niet gelukt.')
          setLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [teamService])

  return (
    <main className="screen home-screen">
      <header className="home-header">
        <button type="button" onClick={() => authService.signOut()}>
          Uitloggen
        </button>
      </header>

      {loading && <p>Team laden…</p>}
      {error && <p role="alert">{error}</p>}

      {team && (
        <>
          <div className="home-content">
            <Routes>
              <Route index element={<Navigate to="/wedstrijden" replace />} />
              <Route path="spelers" element={<PlayerListScreen spelerService={spelerService} teamId={team.id} />} />
              <Route
                path="wedstrijden/*"
                element={
                  <WedstrijdScreen
                    wedstrijdService={wedstrijdService}
                    spelerService={spelerService}
                    aanwezigheidService={aanwezigheidService}
                    opstellingService={opstellingService}
                    teamId={team.id}
                  />
                }
              />
              <Route
                path="dashboard"
                element={
                  <DashboardScreen
                    seizoenService={seizoenService}
                    spelerService={spelerService}
                    statistiekenService={statistiekenService}
                    teamId={team.id}
                  />
                }
              />
              <Route path="*" element={<Navigate to="/wedstrijden" replace />} />
            </Routes>
          </div>

          <TabBar />
        </>
      )}
    </main>
  )
}
