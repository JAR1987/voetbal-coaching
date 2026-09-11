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
import { createAanwezigheidService } from './aanwezigheidService'
import { createOpstellingService } from './opstellingService'
import { createStatistiekenService } from './statistiekenService'

export const authService = createAuthService(supabase)
export const teamService = createTeamService(supabase, authService)
export const spelerService = createSpelerService(supabase, authService)
export const seizoenService = createSeizoenService(supabase, authService)
export const wedstrijdService = createWedstrijdService(supabase, authService, seizoenService)
export const aanwezigheidService = createAanwezigheidService(supabase, authService)
export const opstellingService = createOpstellingService(supabase, authService)
export const statistiekenService = createStatistiekenService(supabase, authService)

export type { AuthService, SignInCredentials } from './authService'
export type { TeamService } from './teamService'
export type { SpelerService, NewSpelerInput, SpelerUpdateInput, ListSpelersOptions } from './spelerService'
export type { SeizoenService } from './seizoenService'
export { deriveSeasonLabel } from './seizoenService'
export type { WedstrijdService, NewWedstrijdInput, WedstrijdgegevensInput } from './wedstrijdService'
export type { AanwezigheidService, SpelerAanwezigheid } from './aanwezigheidService'
export type { OpstellingService, OpstellingMap } from './opstellingService'
export type { StatistiekenService, SeizoenStatistieken } from './statistiekenService'
export type { SpelerStatistieken, TeamOverzicht, TeamOverzichtRegel } from './statistiekenAggregatie'
export type { FormatieSlot } from './formaties'
export { FORMATIE_SLOTS } from './formaties'
export type {
  Team,
  Speler,
  SpelerStatus,
  Seizoen,
  Wedstrijd,
  Formaat,
  Formatie,
  ThuisUit,
  Aanwezigheid,
  AanwezigheidStatus,
  FitheidStatus,
} from './types'
export { FORMATIE_OPTIONS, DEFAULT_FORMATIE, FORMAAT_LABELS, FITHEID_OPTIONS, FITHEID_LABELS } from './types'
