// Wires the real supabase-js client into the app's data services. This is
// the only module (besides supabaseClient.ts itself) that imports the real
// client — everything else (components, hooks, tests) depends on the
// AuthService / TeamService interfaces and never needs to know a real
// Supabase project is behind them.
import { supabase } from '../lib/supabaseClient'
import { createAuthService } from './authService'
import { createTeamService } from './teamService'
import { createSpelerService } from './spelerService'
import { createSeizoenService } from './seizoenService'
import { createWedstrijdService } from './wedstrijdService'

export const authService = createAuthService(supabase)
export const teamService = createTeamService(supabase, authService)
export const spelerService = createSpelerService(supabase, authService)
export const seizoenService = createSeizoenService(supabase, authService)
export const wedstrijdService = createWedstrijdService(supabase, authService, seizoenService)

export type { AuthService, SignInCredentials } from './authService'
export type { TeamService } from './teamService'
export type { SpelerService, NewSpelerInput, SpelerUpdateInput, ListSpelersOptions } from './spelerService'
export type { SeizoenService } from './seizoenService'
export { deriveSeasonLabel } from './seizoenService'
export type { WedstrijdService, NewWedstrijdInput } from './wedstrijdService'
export type {
  Team,
  Speler,
  SpelerStatus,
  Seizoen,
  Wedstrijd,
  Formaat,
  Formatie,
  ThuisUit,
} from './types'
export { FORMATIE_OPTIONS, DEFAULT_FORMATIE } from './types'
