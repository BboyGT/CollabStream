const { createClient } = require('@supabase/supabase-js')

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`[supabase] Missing required environment variable: ${name}`)
  }
  return value
}

const supabase = createClient(
  requireEnv('SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY')
)

module.exports = { supabase }
