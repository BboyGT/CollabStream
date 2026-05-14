// index.js — CollabStream signaling server
console.log('CollabStream signaling server — built by Godstime Aburu (BboyGT)')
const express = require('express')
const cors = require('cors')
const http = require('http')
const os = require('os')
const multer = require('multer')
const { WebSocketServer } = require('ws')
const { customAlphabet } = require('nanoid')
const {
  createRoom, getRoom, getRoomByJoinCode, verifyToken,
  setLocked, setGuestCap, getAudit, cleanupRooms, getGuests, getGuestCount,
} = require('./rooms')
const {
  createSessionRecord, endSessionRecord, addAuditEvent,
  listSessionHistory, getAuditTrail, getDashboardStats,
  pruneOldData, getStats, setRecordingUrl,
} = require('./db')
const { handleMessage, handleClose } = require('./relay')
const { supabase } = require('./supabase')
const { stripe } = require('./stripe')
const { uploadRecording, getRecordingUrl, uploadLogo } = require('./r2')

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } })
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

// ── Auth middleware ────────────────────────────────────────────────────────────
const PLAN_LIMITS = {
  free:     { maxGuests: 3,  durationMinutes: 45  },
  pro:      { maxGuests: 10, durationMinutes: 480 },
  business: { maxGuests: 20, durationMinutes: null },
}

async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '').trim()
  if (!token) return res.status(401).json({ error: 'Not authenticated' })
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return res.status(401).json({ error: 'Invalid token' })
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  req.user = user
  req.profile = profile || {}
  req.plan = profile?.plan || 'free'
  req.planLimits = PLAN_LIMITS[req.plan] || PLAN_LIMITS.free
  next()
}

async function requirePlan(plan) {
  return (req, res, next) => {
    if (req.plan !== plan && !(plan === 'pro' && req.plan === 'business')) {
      return res.status(403).json({ error: `${plan} plan required` })
    }
    next()
  }
}

// ── Webhook helper ─────────────────────────────────────────────────────────────
async function fireWebhook(hostId, event, payload) {
  if (!hostId) return
  try {
    const { data: hooks } = await supabase
      .from('webhooks').select('url').eq('host_id', hostId)
      .eq('active', true).contains('events', [event])
    if (!hooks?.length) return
    await Promise.allSettled(hooks.map((h) =>
      fetch(h.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CollabStream-Event': event },
        body: JSON.stringify({ event, timestamp: new Date().toISOString(), ...payload }),
      }).catch(() => {})
    ))
  } catch {}
}

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
  const token = req.headers.authorization?.replace('Bearer ', '').trim()
  if (!token) return res.status(401).json({ error: 'Not authenticated' })
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return res.status(401).json({ error: 'Invalid token' })
  const { data: profile } = await supabase.from('profiles').select('plan').eq('id', user.id).single()
  res.json({ user: { id: user.id, email: user.email }, plan: profile?.plan || 'free' })
})

// POST /session — create session (auth required, plan limits enforced)
app.post('/session', requireAuth, async (req, res) => {
  const { sessionName, maxGuests, joinMode, durationMinutes } = req.body || {}

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
  const token = tokenid()

  let joinCode = nanoid(8)
  while (getRoomByJoinCode(joinCode)) joinCode = nanoid(8)
  let shortCode = Math.floor(100000 + Math.random() * 900000).toString()
  while (getRoomByJoinCode(shortCode)) shortCode = Math.floor(100000 + Math.random() * 900000).toString()

  const opts = {
    sessionName: String(sessionName || '').slice(0, 40),
    maxGuests: effectiveMaxGuests,
    joinMode: ['open', 'approval', 'locked'].includes(joinMode) ? joinMode : 'open',
    durationMinutes: effectiveDuration,
  }

  createRoom(sessionId, token, joinCode, shortCode, opts)
  await createSessionRecord(sessionId, req.user.id, { ...opts, joinCode, shortCode })
  await addAuditEvent(sessionId, 'session-created', { hostId: req.user.id })
  await fireWebhook(req.user.id, 'session.start', { sessionId, sessionName: opts.sessionName })

  res.json({ sessionId, token, joinCode, shortCode, ...opts })
})

// GET /session/:id
app.get('/session/:sessionId', async (req, res) => {
  const room = getRoom(req.params.sessionId)
  if (!room) return res.status(404).json({ error: 'not-found' })
  const token = req.query.token
  const isHost = token && verifyToken(req.params.sessionId, token)
  res.json({
    ok: true, locked: room.locked, joinCode: isHost ? room.joinCode : undefined,
    shortCode: isHost ? room.shortCode : undefined,
    joinMode: room.joinMode, durationMinutes: room.durationMinutes || 120,
    sessionName: room.sessionName || '', maxGuests: room.maxGuests,
    guestCount: room.guests ? room.guests.size : 0,
  })
})

// GET /session/:id/branding — returns host branding for guest rooms
app.get('/session/:sessionId/branding', async (req, res) => {
  const room = getRoom(req.params.sessionId)
  if (!room) return res.status(404).json({ error: 'not-found' })
  // Look up host profile from Supabase sessions table
  const { data: sess } = await supabase.from('sessions').select('host_id').eq('id', req.params.sessionId).single()
  if (!sess?.host_id) return res.json({ logoUrl: null, accentColor: '#22d3ee' })
  const { data: profile } = await supabase.from('profiles').select('logo_url, accent_color').eq('id', sess.host_id).single()
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
  res.json({
    sessionId: room.sessionId, token: room.token, locked: room.locked,
    joinCode: room.joinCode, shortCode: room.shortCode,
    joinMode: room.joinMode, durationMinutes: room.durationMinutes || 120,
    sessionName: room.sessionName || '',
  })
})

app.get('/join/:code', (req, res) => {
  const room = getRoomByJoinCode(req.params.code)
  if (!room) return res.status(404).json({ error: 'not-found' })
  if (room.locked || room.joinMode === 'locked') return res.status(423).json({ error: 'room-locked' })
  res.json({ sessionId: room.sessionId, token: room.token, locked: room.locked, joinCode: room.joinCode, shortCode: room.shortCode, joinMode: room.joinMode, durationMinutes: room.durationMinutes || 120 })
})

app.post('/session/:sessionId/lock', async (req, res) => {
  const token = req.query.token
  if (!verifyToken(req.params.sessionId, token)) return res.status(403).json({ error: 'invalid-token' })
  const { locked } = req.body || {}
  const ok = setLocked(req.params.sessionId, !!locked)
  res.json({ ok })
})

app.patch('/session/:sessionId/cap', async (req, res) => {
  const token = req.query.token
  if (!verifyToken(req.params.sessionId, token)) return res.status(403).json({ error: 'invalid-token' })
  const maxGuests = req.body?.maxGuests === null ? null : Number(req.body?.maxGuests)
  const result = setGuestCap(req.params.sessionId, isNaN(maxGuests) ? null : maxGuests)
  if (result?.error) return res.status(400).json(result)
  res.json({ ok: true })
})

app.get('/session/:sessionId/audit', async (req, res) => {
  const token = req.query.token
  if (!verifyToken(req.params.sessionId, token)) return res.status(403).json({ error: 'invalid-token' })
  const events = await getAuditTrail(req.params.sessionId)
  res.json({ events })
})

// ── Dashboard ──────────────────────────────────────────────────────────────────
app.get('/api/dashboard', requireAuth, async (req, res) => {
  const page = Math.max(0, parseInt(req.query.page || '0'))
  const limit = 10
  const stats = await getDashboardStats(req.user.id)
  const sessions = await listSessionHistory(req.user.id, 200)
  const paged = sessions.slice(page * limit, (page + 1) * limit)
  const totalPages = Math.ceil(sessions.length / limit)
  res.json({ stats, sessions: paged, totalPages, page })
})

app.get('/api/sessions/:sessionId/audit', requireAuth, async (req, res) => {
  const events = await getAuditTrail(req.params.sessionId)
  res.json({ events })
})

// ── Cloud recording (Business plan) ───────────────────────────────────────────
app.post('/api/sessions/:sessionId/recording', requireAuth, upload.single('file'), async (req, res) => {
  if (req.plan !== 'business') return res.status(403).json({ error: 'business plan required' })
  if (!req.file) return res.status(400).json({ error: 'No file provided' })
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

app.get('/api/sessions/:sessionId/recording', requireAuth, async (req, res) => {
  const { data: sess } = await supabase.from('sessions').select('recording_url').eq('id', req.params.sessionId).single()
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
  const profile = req.profile
  let logoUrl = null
  if (profile?.logo_url) {
    try { logoUrl = await getRecordingUrl(profile.logo_url) } catch {}
  }
  res.json({ logoUrl, accentColor: profile?.accent_color || '#22d3ee' })
})

app.patch('/user/branding', requireAuth, upload.single('logo'), async (req, res) => {
  if (req.plan !== 'business') return res.status(403).json({ error: 'business plan required' })
  const updates = {}
  if (req.body?.accentColor) updates.accent_color = req.body.accentColor
  if (req.file) {
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
app.get('/api/webhooks', requireAuth, async (req, res) => {
  if (req.plan !== 'business') return res.status(403).json({ error: 'business plan required' })
  const { data } = await supabase.from('webhooks').select('*').eq('host_id', req.user.id)
  res.json({ webhooks: data || [] })
})

app.post('/api/webhooks', requireAuth, async (req, res) => {
  if (req.plan !== 'business') return res.status(403).json({ error: 'business plan required' })
  const { url, events } = req.body || {}
  if (!url) return res.status(400).json({ error: 'url required' })
  const { data, error } = await supabase.from('webhooks').insert({ host_id: req.user.id, url, events: events || ['session.start', 'session.end', 'guest.join', 'recording.ready'] }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json({ webhook: data })
})

app.delete('/api/webhooks/:id', requireAuth, async (req, res) => {
  if (req.plan !== 'business') return res.status(403).json({ error: 'business plan required' })
  await supabase.from('webhooks').delete().eq('id', req.params.id).eq('host_id', req.user.id)
  res.json({ ok: true })
})

// ── Persistent Whiteboards (Business plan) ─────────────────────────────────────
app.get('/api/whiteboards', requireAuth, async (req, res) => {
  if (req.plan !== 'business') return res.status(403).json({ error: 'business plan required' })
  const { data } = await supabase.from('whiteboards').select('id, name, updated_at').eq('host_id', req.user.id).order('updated_at', { ascending: false })
  res.json({ whiteboards: data || [] })
})

app.post('/api/whiteboards', requireAuth, async (req, res) => {
  if (req.plan !== 'business') return res.status(403).json({ error: 'business plan required' })
  const { name } = req.body || {}
  if (!name) return res.status(400).json({ error: 'name required' })
  const { data, error } = await supabase.from('whiteboards').insert({ host_id: req.user.id, name, strokes: [] }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json({ whiteboard: data })
})

app.get('/api/whiteboards/:id', requireAuth, async (req, res) => {
  const { data } = await supabase.from('whiteboards').select('*').eq('id', req.params.id).eq('host_id', req.user.id).single()
  if (!data) return res.status(404).json({ error: 'not-found' })
  res.json({ whiteboard: data })
})

app.patch('/api/whiteboards/:id', requireAuth, async (req, res) => {
  if (req.plan !== 'business') return res.status(403).json({ error: 'business plan required' })
  const { strokes } = req.body || {}
  const { error } = await supabase.from('whiteboards').update({ strokes: strokes || [], updated_at: new Date().toISOString() }).eq('id', req.params.id).eq('host_id', req.user.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

app.delete('/api/whiteboards/:id', requireAuth, async (req, res) => {
  await supabase.from('whiteboards').delete().eq('id', req.params.id).eq('host_id', req.user.id)
  res.json({ ok: true })
})

// ── Admin ──────────────────────────────────────────────────────────────────────
function requireAdminToken(req, res) {
  const expectedToken = process.env.ADMIN_TOKEN
  if (!expectedToken) {
    res.status(503).json({ error: 'admin-disabled' })
    return false
  }
  const token = String(req.query.token || '')
  if (token !== expectedToken) {
    res.status(403).json({ error: 'forbidden' })
    return false
  }
  return true
}

app.get('/admin/sessions', async (req, res) => {
  if (!requireAdminToken(req, res)) return
  const limit = Math.min(Number(req.query.limit || 50), 200)
  const sessions = await listSessionHistory(null, limit)
  res.json({ sessions })
})

app.get('/admin/stats', async (req, res) => {
  if (!requireAdminToken(req, res)) return
  res.json(await getStats())
})

// ── WebSocket signaling ────────────────────────────────────────────────────────
const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })
const wsMap = new Map()

wss.on('connection', (ws) => {
  ws.isAlive = true
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
setInterval(() => pruneOldData(Number(process.env.RETENTION_DAYS || 30)), 6 * 60 * 60 * 1000)

const PORT = process.env.PORT || 3001
server.listen(PORT, () => { console.log(`CollabStream signaling server running on :${PORT}`) })
