import { supabase } from './supabase.js'
import { apiUrl } from './api.js'

const ADMIN_TOKEN_KEY = 'collabstream_admin_token'

export function getAdminToken() {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(ADMIN_TOKEN_KEY) || ''
}

export function setAdminToken(token) {
  if (typeof window === 'undefined') return
  const value = String(token || '').trim()
  if (value) window.localStorage.setItem(ADMIN_TOKEN_KEY, value)
  else window.localStorage.removeItem(ADMIN_TOKEN_KEY)
}

export async function getSession() {
  return supabase.auth.getSession()
}

export async function getUser() {
  const { data: { session } } = await getSession()
  return session?.user || null
}

export async function getToken() {
  const { data: { session } } = await getSession()
  return session?.access_token || null
}

export async function signOut() {
  await supabase.auth.signOut()
}

export async function getUserPlan() {
  const token = await getToken()
  if (!token) return 'free'
  try {
    const res = await fetch(apiUrl('/auth/status'), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return 'free'
    const data = await res.json()
    return data.plan || 'free'
  } catch {
    return 'free'
  }
}

export async function getAuthStatus() {
  const token = await getToken()
  if (!token) return { enabled: false, provider: 'none' }
  try {
    const res = await fetch(apiUrl('/auth/status'), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return { enabled: false, provider: 'none' }
    const data = await res.json()
    return {
      enabled: true,
      provider: 'supabase',
      user: data.user || null,
      plan: data.plan || 'free',
    }
  } catch {
    return { enabled: false, provider: 'none' }
  }
}
