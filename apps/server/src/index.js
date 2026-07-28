require('dotenv').config()

console.log('CollabStream signaling server - built by Godstime Aburu')
const express = require('express')
const cors = require('cors')
const dns = require('dns').promises
const http = require('http')
const https = require('https')
const net = require('net')
const os = require('os')
const multer = require('multer')
const { WebSocketServer } = require('ws')
const { customAlphabet } = require('nanoid')
const {
  createRoom, getRoom, getRoomByJoinCode, verifyToken,
  issueGuestToken, isIpBanned,
  setLocked, setGuestCap, getAudit, cleanupRooms, getGuests, getGuestCount,
  endRoom, setLifecycleHandlers,
} = require('./rooms')
const {
  createSessionRecord, endSessionRecord,
  listSessionHistory, getAuditTrail, getDashboardStats,
  pruneOldData, getStats, setRecordingUrl,
  logWebhookDelivery, getWebhookDeliveries,
} = require('./db')
const { handleMessage, handleClose } = require('./relay')
const { supabase } = require('./supabase')
const { stripe } = require('./stripe')
const { uploadRecording, getRecordingUrl, uploadLogo } = require('./r2')

function positiveNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const recordingUploadLimitMb = positiveNumber(process.env.MAX_RECORDING_UPLOAD_MB, 100)
const logoUploadLimitMb = positiveNumber(process.env.MAX_LOGO_UPLOAD_MB, 2)
const recordingUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: recordingUploadLimitMb * 1024 * 1024 },
})
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: logoUploadLimitMb * 1024 * 1024 },
})
const rateLimitWindowMs = positiveNumber(process.env.RATE_LIMIT_WINDOW_MS, 60_000)
const rateLimitMax = positiveNumber(process.env.RATE_LIMIT_MAX, 120)
const rateLimitBuckets = new Map()
let retentionDays = positiveNumber(process.env.RETENTION_DAYS, 30)
const rateLimitCleanup = setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAt <= now) rateLimitBuckets.delete(key)
  }
}, rateLimitWindowMs)
rateLimitCleanup.unref?.()
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 21)
const tokenid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 32)

const app = express()

function parseAllowedOrigins(value = '') {
  return value
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)
}

const allowedOrigins = parseAllowedOrigins(
  process.env.CORS_ORIGINS || process.env.PUBLIC_WEB_ORIGIN || ''
)
const localDevOrigin = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin) return callback(null, true)
    const normalizedOrigin = origin.replace(/\/$/, '')
    if (allowedOrigins.includes(normalizedOrigin)) return callback(null, true)
    if (process.env.NODE_ENV !== 'production' && localDevOrigin.test(normalizedOrigin)) {
      return callback(null, true)
    }
    return callback(null, false)
  },
}))

// Webhook route must use raw body before express.json() is registered
app.post('/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'billing-not-configured' })
  if (!supabase) return res.status(503).json({ error: 'supabase-not-configured' })
  const sig = req.headers['stripe-signature']
  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(400).json({ error: 'Missing signature or webhook secret' })
  }
  let event
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` })
  }

  const session = event.data.object

  if (event.type === 'checkout.session.completed') {
    const userId = session.metadata?.userId
    if (!userId) return res.json({ received: true })
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 })
    const priceId = lineItems.data[0]?.price?.id
    const plan = priceId === process.env.STRIPE_BUSINESS_PRICE_ID ? 'business' : 'pro'
    await supabase.from('profiles').update({
      stripe_customer_id: session.customer,
      stripe_subscription_id: session.subscription,
      plan,
    }).eq('id', userId)
  }

  if (event.type === 'customer.subscription.deleted') {
    const customerId = session.customer
    await supabase.from('profiles').update({ plan: 'free' }).eq('stripe_customer_id', customerId)
  }

  if (event.type === 'customer.subscription.updated') {
    const customerId = session.customer
    const priceId = session.items?.data?.[0]?.price?.id
    if (priceId) {
      const plan = priceId === process.env.STRIPE_BUSINESS_PRICE_ID ? 'business' : 'pro'
      await supabase.from('profiles').update({ plan }).eq('stripe_customer_id', customerId)
    }
  }

  res.json({ received: true })
})

app.use(express.json())

function rateLimit(req, res, next) {
  if (req.path === '/health') return next()
  const now = Date.now()
  const key = req.ip || req.socket.remoteAddress || 'unknown'
  const bucket = rateLimitBuckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + rateLimitWindowMs })
    return next()
  }

  bucket.count += 1
  if (bucket.count > rateLimitMax) {
    res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000))
    return res.status(429).json({ error: 'rate-limit' })
  }

  return next()
}

app.use(rateLimit)

// ── Auth middleware ────────────────────────────────────────────────────────────
const PLAN_LIMITS = {
  free:     { maxGuests: 3,  durationMinutes: 45  },
  pro:      { maxGuests: 10, durationMinutes: 480 },
  business: { maxGuests: 20, durationMinutes: null },
}
const PLAN_RANK = { free: 0, pro: 1, business: 2 }

function hasPlan(actualPlan, requiredPlan) {
  return (PLAN_RANK[actualPlan] ?? 0) >= (PLAN_RANK[requiredPlan] ?? 0)
}

function isPrivateIp(address) {
  if (net.isIPv4(address)) {
    const parts = address.split('.').map(Number)
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 0)
    )
  }

  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase()
    return (
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80:')
    )
  }

  return true
}

async function validateWebhookUrl(rawUrl) {
  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('invalid webhook url')
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('webhook url must use https')
  }

  const records = await dns.lookup(parsed.hostname, { all: true })
  if (!records.length || records.some((record) => isPrivateIp(record.address))) {
    throw new Error('webhook url resolves to a private address')
  }

  // Pin the IP we just validated. If we let the subsequent request re-resolve
  // the hostname itself, an attacker controlling DNS for that hostname could
  // return a public IP for this check and a private/internal IP microseconds
  // later for the real connection (classic DNS-rebinding) — see AUDIT.md §2.5.
  const pinned = records[0]
  return { url: parsed.toString(), hostname: parsed.hostname, address: pinned.address, family: pinned.family }
}

async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '').trim()
  if (!token) return res.status(401).json({ error: 'Not authenticated' })
  if (!supabase) return res.status(503).json({ error: 'supabase-not-configured' })
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return res.status(401).json({ error: 'Invalid token' })
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  req.user = user
  req.profile = profile || {}
  req.plan = profile?.plan || 'free'
  req.planLimits = PLAN_LIMITS[req.plan] || PLAN_LIMITS.free
  next()
}

function requirePlan(plan) {
  return (req, res, next) => {
    if (!hasPlan(req.plan, plan)) {
      return res.status(403).json({ error: `${plan} plan required` })
    }
    next()
  }
}

// Delivers a webhook POST to a specific, pre-validated IP address instead of
// letting Node re-resolve the hostname (which is what defeats the DNS pin —
// see AUDIT.md §2.5). TLS servername/Host still use the original hostname,
// only the socket's destination address is forced to the validated IP.
function postJsonPinned(hostname, address, family, path, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname,
      // Node ignores `lookup`'s hostname arg and just needs an address+family
      // back; forcing it here is what pins the connection.
      lookup: (_host, _opts, cb) => cb(null, address, family || (net.isIPv6(address) ? 6 : 4)),
      port: 443,
      path: path || '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-CollabStream-Event': JSON.parse(body).event,
      },
      timeout: 10_000,
    }, (res) => {
      res.resume() // drain response body, we don't need it
      res.on('end', () => resolve(res.statusCode))
    })
    req.on('timeout', () => req.destroy(new Error('webhook request timed out')))
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ── Webhook helper ─────────────────────────────────────────────────────────────
async function fireWebhook(hostId, event, payload) {
  if (!hostId || !supabase) return
  try {
    const { data: hooks } = await supabase
      .from('webhooks').select('id, url').eq('host_id', hostId)
      .eq('active', true).contains('events', [event])
    if (!hooks?.length) return
    const body = JSON.stringify({ event, timestamp: new Date().toISOString(), ...payload })
    const results = await Promise.allSettled(hooks.map(async (h) => {
      try {
        const { hostname, address, family, url } = await validateWebhookUrl(h.url)
        const parsed = new URL(url)
        const statusCode = await postJsonPinned(hostname, address, family, parsed.pathname + parsed.search, body)
        // Delivery log entry — design idea §3.3, visible to the host in
        // Settings so a failed delivery isn't only a server-side console.warn.
        logWebhookDelivery(h.id, hostId, event, statusCode, statusCode >= 200 && statusCode < 300)
        return statusCode
      } catch (err) {
        logWebhookDelivery(h.id, hostId, event, null, false, err.message)
        throw err
      }
    }))
    results.forEach((result) => {
      if (result.status === 'rejected') {
        console.warn('[webhook] delivery failed:', result.reason?.message || result.reason)
      }
    })
  } catch (err) {
    console.warn('[webhook] delivery skipped:', err.message)
  }
}

setLifecycleHandlers({
  onGuestJoin: (hostId, sessionId, peerId, sessionName) =>
    fireWebhook(hostId, 'guest.join', { sessionId, peerId, sessionName }),
  onSessionEnd: (hostId, sessionId, sessionName) =>
    fireWebhook(hostId, 'session.end', { sessionId, sessionName }),
})

// ── Utility ────────────────────────────────────────────────────────────────────
function getLocalIps() {
  const nets = os.networkInterfaces()
  const ips = []
  Object.values(nets).forEach((entries) => {
    entries?.forEach((net) => {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address)
    })
  })
  return ips
}

// ── Public routes ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true }))

app.get('/public-host', (_req, res) => {
  const envOrigin = process.env.PUBLIC_WEB_ORIGIN
  if (envOrigin) return res.json({ origin: envOrigin })
  const ips = getLocalIps()
  const ip = ips[0] || null
  const port = process.env.PUBLIC_WEB_PORT || 5173
  res.json({ origin: ip ? `http://${ip}:${port}` : null, ip, ips })
})

// GET /auth/status — verify bearer token, return user + plan
app.get('/auth/status', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'supabase-not-configured' })
  const token = req.headers.authorization?.replace('Bearer ', '').trim()
  if (!token) return res.status(401).json({ error: 'Not authenticated' })
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return res.status(401).json({ error: 'Invalid token' })
  const { data: profile } = await supabase.from('profiles').select('plan').eq('id', user.id).single()
  res.json({ user: { id: user.id, email: user.email }, plan: profile?.plan || 'free' })
})

// POST /session — create session (auth required, plan limits enforced)
app.post('/session', requireAuth, async (req, res) => {
  const { sessionName, maxGuests, joinMode, durationMinutes, scheduled } = req.body || {}

  // Plan-enforced limits
  const limits = req.planLimits
  const effectiveMaxGuests = limits.maxGuests
    ? Math.min(Number(maxGuests) || limits.maxGuests, limits.maxGuests)
    : (maxGuests ? Math.min(Number(maxGuests), 20) : null)
  const effectiveDuration = limits.durationMinutes
    ? Math.min(Number(durationMinutes) || limits.durationMinutes, limits.durationMinutes)
    : Math.min(Number(durationMinutes) || 120, 480)

  // Free plan: reject sessions with > 3 guests requested
  if (maxGuests && Number(maxGuests) > effectiveMaxGuests) {
    return res.status(403).json({ error: 'plan-limit', message: `Your plan allows a maximum of ${effectiveMaxGuests} guests` })
  }

  const sessionId = nanoid()
  const hostToken = tokenid()

  let joinCode = nanoid(8)
  while (getRoomByJoinCode(joinCode)) joinCode = nanoid(8)
  let shortCode = Math.floor(100000 + Math.random() * 900000).toString()
  while (getRoomByJoinCode(shortCode)) shortCode = Math.floor(100000 + Math.random() * 900000).toString()

  const opts = {
    sessionName: String(sessionName || '').slice(0, 40),
    hostId: req.user.id,
    maxGuests: effectiveMaxGuests,
    maxGuestLimit: limits.maxGuests || 20,
    hostPlan: req.plan,
    joinMode: ['open', 'approval', 'locked'].includes(joinMode) ? joinMode : 'open',
    durationMinutes: effectiveDuration,
    // Pre-launch lobby (docs/pre-launch-lobby-plan.md): scheduled:true
    // creates the room with started:false instead of immediately live —
    // the client (AppLanding.jsx's "Schedule for later") still navigates
    // the creator into the same HostRoom route as a normal session, but
    // HostRoom renders a lobby view instead of the live call until the
    // host explicitly starts it.
    scheduled: !!scheduled,
  }

  createRoom(sessionId, hostToken, joinCode, shortCode, opts)
  await createSessionRecord(sessionId, req.user.id, { ...opts, joinCode, shortCode })
  if (!opts.scheduled) await fireWebhook(req.user.id, 'session.start', { sessionId, sessionName: opts.sessionName })

  res.json({ sessionId, token: hostToken, joinCode, shortCode, ...opts })
})

// GET /session/:id
app.get('/session/:sessionId', async (req, res) => {
  const room = getRoom(req.params.sessionId)
  if (!room) return res.status(404).json({ error: 'not-found' })
  const token = req.query.token
  const isHost = token && verifyToken(req.params.sessionId, token, 'host')
  res.json({
    ok: true, locked: room.locked, joinCode: isHost ? room.joinCode : undefined,
    shortCode: isHost ? room.shortCode : undefined,
    joinMode: room.joinMode, durationMinutes: room.durationMinutes || 120,
    sessionName: room.sessionName || '', maxGuests: room.maxGuests,
    guestCount: room.guests ? room.guests.size : 0,
    started: room.started !== false,
  })
})

// GET /session/:id/branding — returns host branding for guest rooms
app.get('/session/:sessionId/branding', async (req, res) => {
  const room = getRoom(req.params.sessionId)
  if (!room) return res.status(404).json({ error: 'not-found' })
  if (!supabase) return res.json({ logoUrl: null, accentColor: '#22d3ee' })
  // Look up host profile from Supabase sessions table
  const { data: sess } = await supabase.from('sessions').select('host_id').eq('id', req.params.sessionId).single()
  if (!sess?.host_id) return res.json({ logoUrl: null, accentColor: '#22d3ee' })
  const { data: profile } = await supabase.from('profiles').select('plan, logo_url, accent_color').eq('id', sess.host_id).single()
  if (!hasPlan(profile?.plan || 'free', 'business')) return res.json({ logoUrl: null, accentColor: '#22d3ee' })
  let logoUrl = null
  if (profile?.logo_url) {
    try { logoUrl = await getRecordingUrl(profile.logo_url) } catch {}
  }
  res.json({ logoUrl, accentColor: profile?.accent_color || '#22d3ee' })
})

app.get('/api/join/:code', (req, res) => {
  const room = getRoomByJoinCode(req.params.code)
  if (!room) return res.status(404).json({ error: 'not-found' })
  if (room.locked || room.joinMode === 'locked') return res.status(423).json({ error: 'room-locked' })
  if (isIpBanned(room.sessionId, req.ip)) return res.status(403).json({ error: 'banned' })
  // Mint a brand-new, individually-revocable token for this browser rather
  // than handing out one shared secret — see design idea §3.1. Never
  // return the host token here; this endpoint is hit by anyone with the
  // public join link. See AUDIT.md §1.
  const guestToken = issueGuestToken(room.sessionId, req.ip)
  res.json({
    sessionId: room.sessionId, token: guestToken, locked: room.locked,
    joinCode: room.joinCode, shortCode: room.shortCode,
    joinMode: room.joinMode, durationMinutes: room.durationMinutes || 120,
    sessionName: room.sessionName || '',
    started: room.started !== false,
  })
})

app.get('/join/:code', (req, res) => {
  const room = getRoomByJoinCode(req.params.code)
  if (!room) return res.status(404).json({ error: 'not-found' })
  if (room.locked || room.joinMode === 'locked') return res.status(423).json({ error: 'room-locked' })
  if (isIpBanned(room.sessionId, req.ip)) return res.status(403).json({ error: 'banned' })
  // Same per-browser token minting as /api/join/:code — see design idea §3.1.
  const guestToken = issueGuestToken(room.sessionId, req.ip)
  res.json({ sessionId: room.sessionId, token: guestToken, locked: room.locked, joinCode: room.joinCode, shortCode: room.shortCode, joinMode: room.joinMode, durationMinutes: room.durationMinutes || 120, started: room.started !== false })
})

app.post('/session/:sessionId/lock', async (req, res) => {
  const token = req.query.token
  if (!verifyToken(req.params.sessionId, token, 'host')) return res.status(403).json({ error: 'invalid-token' })
  const { locked } = req.body || {}
  const ok = setLocked(req.params.sessionId, !!locked)
  res.json({ ok })
})

app.patch('/session/:sessionId/cap', async (req, res) => {
  const token = req.query.token
  if (!verifyToken(req.params.sessionId, token, 'host')) return res.status(403).json({ error: 'invalid-token' })
  const maxGuests = req.body?.maxGuests === null ? null : Number(req.body?.maxGuests)
  const result = setGuestCap(req.params.sessionId, isNaN(maxGuests) ? null : maxGuests)
  if (result?.error) return res.status(400).json(result)
  res.json({ ok: true })
})

app.get('/session/:sessionId/audit', async (req, res) => {
  const token = req.query.token
  if (!verifyToken(req.params.sessionId, token, 'host')) return res.status(403).json({ error: 'invalid-token' })
  const room = getRoom(req.params.sessionId)
  if (!hasPlan(room?.hostPlan || 'free', 'pro')) return res.status(403).json({ error: 'pro plan required' })
  const events = await getAuditTrail(req.params.sessionId)
  res.json({ events })
})

// ── Dashboard ──────────────────────────────────────────────────────────────────
app.get('/api/dashboard', requireAuth, requirePlan('pro'), async (req, res) => {
  const page = Math.max(0, parseInt(req.query.page || '0'))
  const limit = 10
  const stats = await getDashboardStats(req.user.id)
  const sessions = await listSessionHistory(req.user.id, 200)
  const paged = sessions.slice(page * limit, (page + 1) * limit)
  const totalPages = Math.ceil(sessions.length / limit)
  res.json({ stats, sessions: paged, totalPages, page })
})

app.get('/api/sessions/:sessionId/audit', requireAuth, requirePlan('pro'), async (req, res) => {
  const { data: sess } = await supabase
    .from('sessions')
    .select('host_id')
    .eq('id', req.params.sessionId)
    .single()
  if (!sess || sess.host_id !== req.user.id) return res.status(404).json({ error: 'not-found' })
  const events = await getAuditTrail(req.params.sessionId)
  res.json({ events })
})

// ── Cloud recording (Business plan) ───────────────────────────────────────────
app.post('/api/sessions/:sessionId/recording', requireAuth, requirePlan('business'), recordingUpload.single('file'), async (req, res) => {
  // SECURITY: without this ownership check, any authenticated business-plan
  // user could overwrite ANY session's recording_url by guessing/knowing
  // another session's id — this was a real IDOR, found during a security
  // review (this route is the odd one out; every other /api/sessions/:id
  // route in this file already checks host_id). See AUDIT.md.
  const { data: sess } = await supabase.from('sessions').select('host_id').eq('id', req.params.sessionId).single()
  if (!sess || sess.host_id !== req.user.id) return res.status(404).json({ error: 'not-found' })
  if (!req.file) return res.status(400).json({ error: 'No file provided' })
  if (!/^video\/webm\b/.test(req.file.mimetype || '')) return res.status(415).json({ error: 'recording must be video/webm' })
  try {
    const key = await uploadRecording(req.params.sessionId, req.file.buffer, req.file.mimetype)
    await setRecordingUrl(req.params.sessionId, key)
    const url = await getRecordingUrl(key)
    const room = getRoom(req.params.sessionId)
    await fireWebhook(req.user.id, 'recording.ready', { sessionId: req.params.sessionId, recordingUrl: url })
    res.json({ url, key })
  } catch (err) {
    console.error('[recording] upload error:', err)
    res.status(500).json({ error: 'Upload failed' })
  }
})

app.get('/api/sessions/:sessionId/recording', requireAuth, requirePlan('business'), async (req, res) => {
  // SECURITY: same IDOR class as the POST route above — without this check,
  // any business-plan user could fetch a presigned download URL for ANY
  // session's recording, not just their own.
  const { data: sess } = await supabase.from('sessions').select('host_id, recording_url').eq('id', req.params.sessionId).single()
  if (!sess || sess.host_id !== req.user.id) return res.status(404).json({ error: 'not-found' })
  if (!sess?.recording_url) return res.status(404).json({ error: 'No recording' })
  try {
    const url = await getRecordingUrl(sess.recording_url)
    res.json({ url })
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate URL' })
  }
})

// ── Branding (Business plan) ───────────────────────────────────────────────────
app.get('/user/branding', requireAuth, async (req, res) => {
  if (!hasPlan(req.plan, 'business')) return res.json({ logoUrl: null, accentColor: '#22d3ee' })
  const profile = req.profile
  let logoUrl = null
  if (profile?.logo_url) {
    try { logoUrl = await getRecordingUrl(profile.logo_url) } catch {}
  }
  res.json({ logoUrl, accentColor: profile?.accent_color || '#22d3ee' })
})

app.patch('/user/branding', requireAuth, requirePlan('business'), logoUpload.single('logo'), async (req, res) => {
  const updates = {}
  if (req.body?.accentColor) updates.accent_color = req.body.accentColor
  if (req.file) {
    if (!/^image\/(png|jpeg|webp|gif|svg\+xml)\b/.test(req.file.mimetype || '')) {
      return res.status(415).json({ error: 'logo must be an image file' })
    }
    try {
      const key = await uploadLogo(req.user.id, req.file.buffer, req.file.mimetype)
      updates.logo_url = key
    } catch (err) {
      return res.status(500).json({ error: 'Logo upload failed' })
    }
  }
  if (Object.keys(updates).length) {
    await supabase.from('profiles').update(updates).eq('id', req.user.id)
  }
  const { data: profile } = await supabase.from('profiles').select('logo_url, accent_color').eq('id', req.user.id).single()
  let logoUrl = null
  if (profile?.logo_url) { try { logoUrl = await getRecordingUrl(profile.logo_url) } catch {} }
  res.json({ logoUrl, accentColor: profile?.accent_color || '#22d3ee' })
})

// ── Billing ────────────────────────────────────────────────────────────────────
app.post('/billing/checkout', requireAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'billing-not-configured' })
  const { priceId, successUrl, cancelUrl } = req.body || {}
  if (!priceId) return res.status(400).json({ error: 'priceId required' })
  try {
    const session = await stripe.checkout.sessions.create({
      customer_email: req.user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: successUrl || `${process.env.WEB_URL || 'http://localhost:5173'}/settings?checkout=success`,
      cancel_url: cancelUrl || `${process.env.WEB_URL || 'http://localhost:5173'}/settings`,
      metadata: { userId: req.user.id },
    })
    res.json({ url: session.url })
  } catch (err) {
    console.error('[billing] checkout error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.post('/billing/portal', requireAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'billing-not-configured' })
  const { returnUrl } = req.body || {}
  const customerId = req.profile?.stripe_customer_id
  if (!customerId) return res.status(400).json({ error: 'No Stripe customer' })
  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || `${process.env.WEB_URL || 'http://localhost:5173'}/settings`,
    })
    res.json({ url: portalSession.url })
  } catch (err) {
    console.error('[billing] portal error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── Webhooks CRUD ──────────────────────────────────────────────────────────────
app.get('/api/webhooks', requireAuth, requirePlan('business'), async (req, res) => {
  const { data } = await supabase.from('webhooks').select('*').eq('host_id', req.user.id)
  res.json({ webhooks: data || [] })
})

app.post('/api/webhooks', requireAuth, requirePlan('business'), async (req, res) => {
  const { url, events } = req.body || {}
  if (!url) return res.status(400).json({ error: 'url required' })
  const { data, error } = await supabase.from('webhooks').insert({ host_id: req.user.id, url, events: events || ['session.start', 'session.end', 'guest.join', 'recording.ready'] }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json({ webhook: data })
})

app.delete('/api/webhooks/:id', requireAuth, requirePlan('business'), async (req, res) => {
  await supabase.from('webhooks').delete().eq('id', req.params.id).eq('host_id', req.user.id)
  res.json({ ok: true })
})

// Delivery log for a single webhook — design idea §3.3. Ownership check
// is via host_id in the query itself, same pattern as delete/CRUD above.
app.get('/api/webhooks/:id/deliveries', requireAuth, requirePlan('business'), async (req, res) => {
  const { data: hook } = await supabase.from('webhooks').select('id').eq('id', req.params.id).eq('host_id', req.user.id).single()
  if (!hook) return res.status(404).json({ error: 'not-found' })
  const deliveries = await getWebhookDeliveries(req.params.id, req.user.id)
  res.json({ deliveries })
})

// ── Persistent Whiteboards (Business plan) ─────────────────────────────────────
app.get('/api/whiteboards', requireAuth, requirePlan('business'), async (req, res) => {
  const { data } = await supabase.from('whiteboards').select('id, name, updated_at').eq('host_id', req.user.id).order('updated_at', { ascending: false })
  res.json({ whiteboards: data || [] })
})

app.post('/api/whiteboards', requireAuth, requirePlan('business'), async (req, res) => {
  const { name } = req.body || {}
  if (!name) return res.status(400).json({ error: 'name required' })
  const { data, error } = await supabase.from('whiteboards').insert({ host_id: req.user.id, name, strokes: [] }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json({ whiteboard: data })
})

app.get('/api/whiteboards/:id', requireAuth, requirePlan('business'), async (req, res) => {
  const { data } = await supabase.from('whiteboards').select('*').eq('id', req.params.id).eq('host_id', req.user.id).single()
  if (!data) return res.status(404).json({ error: 'not-found' })
  res.json({ whiteboard: data })
})

app.patch('/api/whiteboards/:id', requireAuth, requirePlan('business'), async (req, res) => {
  const { strokes } = req.body || {}
  const { error } = await supabase.from('whiteboards').update({ strokes: strokes || [], updated_at: new Date().toISOString() }).eq('id', req.params.id).eq('host_id', req.user.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

app.delete('/api/whiteboards/:id', requireAuth, requirePlan('business'), async (req, res) => {
  await supabase.from('whiteboards').delete().eq('id', req.params.id).eq('host_id', req.user.id)
  res.json({ ok: true })
})

// ── Admin ──────────────────────────────────────────────────────────────────────
// Admin token is read from the Authorization header, not a query param, so it
// can't end up in access logs / browser history / Referer headers (AUDIT.md
// §2.4). Every admin action is logged with the requesting IP and the route
// hit so a leaked token's use can be distinguished from legitimate use.
function requireAdminToken(req, res) {
  const expectedToken = process.env.ADMIN_TOKEN
  if (!expectedToken) {
    res.status(503).json({ error: 'admin-disabled' })
    return false
  }
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token || token !== expectedToken) {
    res.status(403).json({ error: 'forbidden' })
    return false
  }
  const ip = req.ip || req.socket.remoteAddress || 'unknown'
  console.warn(`[admin] ${new Date().toISOString()} ip=${ip} ${req.method} ${req.originalUrl}`)
  return true
}

app.get('/admin/sessions', async (req, res) => {
  if (!requireAdminToken(req, res)) return
  const limit = Math.min(Number(req.query.limit || 50), 200)
  const sessions = await listSessionHistory(null, limit)
  res.json({ sessions })
})

app.get('/admin/retention', async (req, res) => {
  if (!requireAdminToken(req, res)) return
  res.json({ days: retentionDays })
})

app.post('/admin/retention', async (req, res) => {
  if (!requireAdminToken(req, res)) return
  const days = Number(req.body?.days)
  if (!Number.isFinite(days) || days < 1 || days > 3650) {
    return res.status(400).json({ error: 'invalid-retention-days' })
  }
  retentionDays = Math.floor(days)
  res.json({ days: retentionDays })
})

app.get('/admin/sessions/:sessionId/audit', async (req, res) => {
  if (!requireAdminToken(req, res)) return
  const events = await getAuditTrail(req.params.sessionId)
  res.json({
    events: events.map((event) => ({
      ts: event.created_at || event.ts,
      event: event.event_type || event.event,
      payload: event.payload || {},
    })),
  })
})

app.post('/admin/sessions/:sessionId/end', async (req, res) => {
  if (!requireAdminToken(req, res)) return
  const room = endRoom(req.params.sessionId)
  if (room) {
    for (const [, guestWs] of room.guests.entries()) {
      if (guestWs.readyState === 1) guestWs.send(JSON.stringify({ type: 'admin', action: 'end' }))
      try { guestWs.close() } catch {}
    }
    if (room.host?.readyState === 1) {
      room.host.send(JSON.stringify({ type: 'admin', action: 'end' }))
      try { room.host.close() } catch {}
    }
  } else {
    await endSessionRecord(req.params.sessionId)
  }
  res.json({ ok: true })
})

app.get('/admin/stats', async (req, res) => {
  if (!requireAdminToken(req, res)) return
  res.json(await getStats())
})

// ── WebSocket signaling ────────────────────────────────────────────────────────
const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })
const wsMap = new Map()

wss.on('connection', (ws, req) => {
  ws.isAlive = true
  // Stashed for ban enforcement at register time — see design idea §3.1.
  ws._ip = req.socket.remoteAddress
  ws.on('pong', () => { ws.isAlive = true })
  ws.on('message', (raw) => handleMessage(ws, raw, wsMap))
  ws.on('close', () => handleClose(ws, wsMap))
  ws.on('error', (err) => { console.error('WS error:', err.message); handleClose(ws, wsMap) })
})

const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) { ws.terminate(); return }
    ws.isAlive = false; ws.ping()
  })
}, 30000)

wss.on('close', () => clearInterval(pingInterval))
setInterval(() => cleanupRooms(), 60000)
setInterval(() => pruneOldData(retentionDays), 6 * 60 * 60 * 1000)

const PORT = process.env.PORT || 3001
server.listen(PORT, () => { console.log(`CollabStream signaling server running on :${PORT}`) })
