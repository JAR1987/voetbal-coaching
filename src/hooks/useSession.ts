import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { AuthService } from '../data/authService'

export interface UseSessionResult {
  session: Session | null
  /** True until the initial session lookup resolves, so the UI doesn't flash the login screen before a persisted session is restored. */
  loading: boolean
}

/** Tracks the current auth session via the given AuthService, including sign-in/out and cross-reload session restoration. */
export function useSession(authService: AuthService): UseSessionResult {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    authService.getSession().then((current) => {
      if (isMounted) {
        setSession(current)
        setLoading(false)
      }
    })

    const unsubscribe = authService.onAuthStateChange((next) => {
      if (isMounted) {
        setSession(next)
        setLoading(false)
      }
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [authService])

  return { session, loading }
}
