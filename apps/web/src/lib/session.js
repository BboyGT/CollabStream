import { getToken } from './auth.js'

const API_BASE = import.meta.env.VITE_SERVER_URL || ''

function apiUrl(path) {
  if (!API_BASE) return path
  return `${API_BASE.replace(/\/$/, '')}${path}`
}

export async function createSession(options = {}) {
  const token = await getToken()
  const body = {
    sessionName: options.sessionName || '',
    maxGuests: options.maxGuests || null,
    joinMode: options.joinMode || 'open',
    durationMinutes: options.durationMinutes || 120,
  }
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(apiUrl('/session'), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || err.error || 'Failed to create session')
  }
  return res.json()
}

export async function verifySession(sessionId) {
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token')
  const res = await fetch(apiUrl(`/session/${sessionId}?token=${encodeURIComponent(token || '')}`))
  if (!res.ok) return { ok: false }
  const data = await res.json()
  return { ok: true, locked: !!data.locked, joinMode: data.joinMode || 'open', durationMinutes: data.durationMinutes || 120, sessionName: data.sessionName || '' }
}

export async function resolveJoinCode(code) {
  const res = await fetch(apiUrl(`/api/join/${encodeURIComponent(code)}`))
  if (!res.ok) return null
  return res.json()
}

export function guestJoinUrl(origin, code) {
  return `${String(origin || '').replace(/\/$/, '')}/join/${encodeURIComponent(code || '')}`
}

export function hostUrl(sessionId) {
  return `${window.location.origin}/room/${sessionId}/host`
}

export function getPublicOrigin() {
  const envUrl = import.meta.env.VITE_PUBLIC_URL
  if (envUrl) return Promise.resolve(envUrl)
  const { hostname } = window.location
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') return Promise.resolve(window.location.origin)
  return fetch('/public-host')
    .then((r) => r.json())
    .then((d) => d?.origin || window.location.origin)
    .catch(() => window.location.origin)
}

export function guestJoinUrlSync(origin, joinCode) {
  return guestJoinUrl(origin, joinCode)
}
