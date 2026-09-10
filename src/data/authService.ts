import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js'

export interface SignInCredentials {
  email: string
  password: string
}

export interface AuthService {
  /** Resolves with the new session, or throws if the credentials are rejected. */
  signIn(credentials: SignInCredentials): Promise<Session>
  signOut(): Promise<void>
  /** The current session, or null when logged out. Resolves from local storage; no network round-trip needed for a valid session. */
  getSession(): Promise<Session | null>
  /** Subscribes to session changes (sign-in, sign-out, token refresh, session restored on reload). Returns an unsubscribe function. */
  onAuthStateChange(callback: (session: Session | null) => void): () => void
}

/** Wraps Supabase Auth — the only place that touches `client.auth` directly. */
export function createAuthService(client: SupabaseClient): AuthService {
  return {
    async signIn({ email, password }) {
      const { data, error } = await client.auth.signInWithPassword({ email, password })
      if (error) {
        throw error
      }
      if (!data.session) {
        // Shouldn't happen for password sign-in, but keep the return type honest.
        throw new Error('Inloggen is gelukt, maar er is geen sessie ontvangen.')
      }
      return data.session
    },

    async signOut() {
      const { error } = await client.auth.signOut()
      if (error) {
        throw error
      }
    },

    async getSession() {
      const { data, error } = await client.auth.getSession()
      if (error) {
        throw error
      }
      return data.session
    },

    onAuthStateChange(callback) {
      const {
        data: { subscription },
      } = client.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
        callback(session)
      })
      return () => subscription.unsubscribe()
    },
  }
}
