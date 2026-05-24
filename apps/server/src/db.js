// db.js — Supabase-backed persistence layer
// Replaces the previous better-sqlite3 implementation.
// The server uses the service role key which bypasses RLS.
const { supabase } = require('./supabase')

async function createSessionRecord(sessionId, hostId, opts = {}) {
  if (!supabase) return
  const { sessionName, joinCode, shortCode, joinMode, maxGuests, durationMinutes } = opts
  const { error } = await supabase.from('sessions').insert({
    id: sessionId,
    host_id: hostId || null,
    session_name: sessionName || null,
    join_code: joinCode || null,
    short_code: shortCode || null,
    join_mode: joinMode || 'open',
    max_guests: maxGuests || null,
    duration_minutes: durationMinutes || 120,
    status: 'active',
  })
  if (error) console.error('[db] createSessionRecord error:', error.message)
}

async function endSessionRecord(sessionId, peakGuests = 0) {
  if (!supabase) return
  const { error } = await supabase
    .from('sessions')
    .update({ ended_at: new Date().toISOString(), peak_guests: peakGuests, status: 'ended' })
    .eq('id', sessionId)
  if (error) console.error('[db] endSessionRecord error:', error.message)
}

async function addAuditEvent(sessionId, eventType, payload = {}) {
  if (!supabase) return
  const { error } = await supabase.from('audit_events').insert({
    session_id: sessionId,
    event_type: eventType,
    payload,
  })
  if (error) console.error('[db] addAuditEvent error:', error.message)
}

async function listSessionHistory(hostId, limit = 20) {
  if (!supabase) return []
  let query = supabase
    .from('sessions')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit)

  query = hostId ? query.eq('host_id', hostId) : query

  const { data, error } = await query
  if (error) console.error('[db] listSessionHistory error:', error.message)
  return data || []
}

async function getAuditTrail(sessionId) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('audit_events')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  if (error) console.error('[db] getAuditTrail error:', error.message)
  return data || []
}

async function getDashboardStats(hostId) {
  if (!supabase) {
    return { totalSessions: 0, totalGuests: 0, totalMinutes: 0, recordingsSaved: 0 }
  }
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id, peak_guests, started_at, ended_at, recording_url, duration_minutes')
    .eq('host_id', hostId)
  if (error) console.error('[db] getDashboardStats error:', error.message)
  const rows = sessions || []
  const totalSessions = rows.length
  const totalGuests = rows.reduce((s, r) => s + (r.peak_guests || 0), 0)
  const totalMinutes = rows.reduce((s, r) => {
    if (r.ended_at && r.started_at) {
      return s + Math.round((new Date(r.ended_at) - new Date(r.started_at)) / 60000)
    }
    return s + (r.duration_minutes || 0)
  }, 0)
  const recordingsSaved = rows.filter((r) => r.recording_url).length
  return { totalSessions, totalGuests, totalMinutes, recordingsSaved }
}

async function pruneOldData(retentionDays = 30) {
  if (!supabase) return
  const cutoff = new Date(Date.now() - retentionDays * 86400 * 1000).toISOString()
  const { error } = await supabase
    .from('sessions')
    .delete()
    .lt('started_at', cutoff)
    .eq('status', 'ended')
  if (error) console.error('[db] pruneOldData error:', error.message)
}

async function getStats() {
  if (!supabase) return { total: 0, totalSessions: 0, active: 0, today: 0 }
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const [
    { count: total },
    { count: active },
    { count: today },
  ] = await Promise.all([
    supabase.from('sessions').select('id', { count: 'exact', head: true }),
    supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('sessions').select('id', { count: 'exact', head: true }).gte('started_at', todayStart.toISOString()),
  ])
  return {
    total: total || 0,
    totalSessions: total || 0,
    active: active || 0,
    today: today || 0,
  }
}

async function setRecordingUrl(sessionId, key) {
  if (!supabase) return
  const { error } = await supabase
    .from('sessions')
    .update({ recording_url: key })
    .eq('id', sessionId)
  if (error) console.error('[db] setRecordingUrl error:', error.message)
}

module.exports = {
  createSessionRecord,
  endSessionRecord,
  addAuditEvent,
  listSessionHistory,
  getAuditTrail,
  getDashboardStats,
  pruneOldData,
  getStats,
  setRecordingUrl,
}
