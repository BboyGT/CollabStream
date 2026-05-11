import { supabase } from './supabase.js'

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
    const res = await fetch('/auth/status', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return 'free'
    const data = await res.json()
    return data.plan || 'free'
  } catch {
    return 'free'
  }
}
