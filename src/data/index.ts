// Wires the real supabase-js client into the app's data services. This is
// the only module (besides supabaseClient.ts itself) that imports the real
// client — everything else (components, hooks, tests) depends on the
// AuthService / TeamService interfaces and never needs to know a real
// Supabase project is behind them.
import { supabase } from '../lib/supabaseClient'
import { createAuthService } from './authService'
import { createTeamService } from './teamService'

export const authService = createAuthService(supabase)
export const teamService = createTeamService(supabase, authService)

export type { AuthService, SignInCredentials } from './authService'
export type { TeamService } from './teamService'
export type { Team } from './types'
