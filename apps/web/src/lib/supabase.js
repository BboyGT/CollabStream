import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey)

const notConfiguredError = {
  message: 'Authentication is not configured for this deployment.',
}

function createDisabledClient() {
  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      signInWithPassword: async () => ({ data: null, error: notConfiguredError }),
      signUp: async () => ({ data: null, error: notConfiguredError }),
      signOut: async () => ({ error: null }),
    },
    from: () => ({
      upsert: async () => ({ data: null, error: notConfiguredError }),
    }),
  }
}

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createDisabledClient()
