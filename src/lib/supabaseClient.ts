import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Ontbrekende Supabase-configuratie: zet VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY ' +
      'in .env.local (zie .env.example).',
  )
}

/**
 * The single supabase-js client instance for the whole app.
 *
 * This file is the ONLY place that should import `@supabase/supabase-js` or
 * read the Supabase env vars. Everything else — components, hooks, other
 * services — goes through `src/data/*`, which takes a client as a parameter
 * instead of importing this module directly. That's what lets tests swap in
 * an in-memory fake without touching env vars or the network. See
 * `src/data/index.ts` for where this client gets wired into the real
 * services used by the app.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Default, but explicit: keep the coach logged in across reloads.
    persistSession: true,
    autoRefreshToken: true,
  },
})
