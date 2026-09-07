import { useEffect, useState } from 'react'
import type { AuthService } from '../data/authService'
import type { TeamService } from '../data/teamService'
import type { SpelerService } from '../data/spelerService'
import type { WedstrijdService } from '../data/wedstrijdService'
import type { AanwezigheidService } from '../data/aanwezigheidService'
import type { Team } from '../data/types'
import { PlayerListScreen } from './PlayerListScreen'
import { WedstrijdScreen } from './WedstrijdScreen'

interface HomeScreenProps {
  authService: AuthService
  teamService: TeamService
  spelerService: SpelerService
  wedstrijdService: WedstrijdService
  aanwezigheidService: AanwezigheidService
}

/**
 * Home screen for a logged-in coach: makes sure the coach's (single, for
 * now) team exists — creating it on first login if needed — then shows the
 * player list and the match list/creation form for it. See
 * `teamService.getOrCreateMyTeam` for the get-or-create logic; there's
 * deliberately no team-switcher or team-name editing UI yet, per the
 * ticket.
 */
export function HomeScreen({
  authService,
  teamService,
  spelerService,
  wedstrijdService,
  aanwezigheidService,
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
      <h1>Opstelling Coach</h1>

      {loading && <p>Team laden…</p>}
      {error && <p role="alert">{error}</p>}
      {team && (
        <>
          <PlayerListScreen spelerService={spelerService} teamId={team.id} />
          <WedstrijdScreen
            wedstrijdService={wedstrijdService}
            spelerService={spelerService}
            aanwezigheidService={aanwezigheidService}
            teamId={team.id}
          />
        </>
      )}

      <button type="button" onClick={() => authService.signOut()}>
        Uitloggen
      </button>
    </main>
  )
}
