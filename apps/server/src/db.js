// db.js — Supabase-backed persistence layer
// Replaces the previous better-sqlite3 implementation.
// The server uses the service role key which bypasses RLS.
const { supabase } = require('./supabase')

async function createSessionRecord(sessionId, hostId, opts = {}) {
  if (!supabase) return
  const { sessionName, joinCode, shortCode, joinMode, maxGuests, durationMinutes, scheduled, hostToken } = opts
  const { error } = await supabase.from('sessions').insert({
    id: sessionId,
    host_id: hostId || null,
    host_token: hostToken || null,
    session_name: sessionName || null,
    join_code: joinCode || null,
    short_code: shortCode || null,
    join_mode: joinMode || 'open',
    max_guests: maxGuests || null,
    duration_minutes: durationMinutes || 120,
    status: scheduled ? 'scheduled' : 'active',
  })
  if (error) console.error('[db] createSessionRecord error:', error.message)
}

async function startSessionRecord(sessionId) {
  if (!supabase) return
  const { error } = await supabase
    .from('sessions')
    .update({ status: 'active', started_at: new Date().toISOString() })
    .eq('id', sessionId)
  if (error) console.error('[db] startSessionRecord error:', error.message)
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

async function getSessionAnalytics(sessionId, hostId) {
  if (!supabase) return { talkTime: [], totalFloorSeconds: 0 }
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, host_id, ended_at')
    .eq('id', sessionId)
    .single()
  if (sessionError || !session || session.host_id !== hostId) return null

  const events = await getAuditTrail(sessionId)
  const totals = new Map()
  let active = null

  for (const event of events) {
    const type = event.event_type || ''
    const at = new Date(event.created_at).getTime()
    if (type.startsWith('floor-granted:')) {
      if (active) {
        totals.set(active.peerId, (totals.get(active.peerId) || 0) + Math.max(0, Math.round((at - active.startedAt) / 1000)))
      }
      active = { peerId: type.slice('floor-granted:'.length), startedAt: at }
    } else if (type === 'floor-revoked' && active) {
      totals.set(active.peerId, (totals.get(active.peerId) || 0) + Math.max(0, Math.round((at - active.startedAt) / 1000)))
      active = null
    }
  }

  if (active) {
    const endAt = session.ended_at ? new Date(session.ended_at).getTime() : Date.now()
    totals.set(active.peerId, (totals.get(active.peerId) || 0) + Math.max(0, Math.round((endAt - active.startedAt) / 1000)))
  }

  const talkTime = Array.from(totals.entries())
    .map(([peerId, seconds]) => ({ peerId, seconds }))
    .sort((a, b) => b.seconds - a.seconds)

  return {
    talkTime,
    totalFloorSeconds: talkTime.reduce((sum, item) => sum + item.seconds, 0),
  }
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

// Records the outcome of a single webhook delivery attempt — design idea
// §3.3. Best-effort like everything else in this file: a logging failure
// must never take down the delivery itself, so callers should not await
// this in a way that blocks the response to the host.
async function logWebhookDelivery(webhookId, hostId, event, statusCode, ok, errorMessage) {
  if (!supabase) return
  const { error } = await supabase.from('webhook_deliveries').insert({
    webhook_id: webhookId,
    host_id: hostId || null,
    event,
    status_code: statusCode ?? null,
    ok: !!ok,
    error: errorMessage || null,
  })
  if (error) console.error('[db] logWebhookDelivery error:', error.message)
}

// Returns the most recent delivery attempts for one webhook, newest first.
async function getWebhookDeliveries(webhookId, hostId, limit = 50) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('webhook_deliveries')
    .select('*')
    .eq('webhook_id', webhookId)
    .eq('host_id', hostId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) console.error('[db] getWebhookDeliveries error:', error.message)
  return data || []
}

module.exports = {
  createSessionRecord,
  startSessionRecord,
  endSessionRecord,
  addAuditEvent,
  listSessionHistory,
  getAuditTrail,
  getSessionAnalytics,
  getDashboardStats,
  pruneOldData,
  getStats,
  setRecordingUrl,
  logWebhookDelivery,
  getWebhookDeliveries,
}
