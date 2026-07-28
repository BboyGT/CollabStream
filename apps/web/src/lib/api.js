const API_BASE = import.meta.env.VITE_SERVER_URL || ''

export function apiUrl(path) {
  if (!API_BASE) return path
  return `${API_BASE.replace(/\/$/, '')}${path}`
}
