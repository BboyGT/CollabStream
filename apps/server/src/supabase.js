const { createClient } = require('@supabase/supabase-js')
const WebSocket = require('ws')

const hasSupabaseEnv = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)

if (!hasSupabaseEnv) {
  console.warn('[supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing - auth and persistence routes will be unavailable')
}

const supabase = hasSupabaseEnv
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      realtime: { transport: WebSocket },
    })
  : null

module.exports = { supabase, hasSupabaseEnv }
