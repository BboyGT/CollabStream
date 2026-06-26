import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Landing from './pages/Landing.jsx'
import AppLanding from './pages/AppLanding.jsx'
import HostRoom from './pages/HostRoom.jsx'
import GuestRoom from './pages/GuestRoom.jsx'
import AdminDashboard from './pages/AdminDashboard.jsx'
import AuthPage from './pages/AuthPage.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Settings from './pages/Settings.jsx'
import JoinPage from './pages/JoinPage.jsx'
import { ToastProvider } from './components/Toast.jsx'
import { supabase } from './lib/supabase.js'
import { getToken } from './lib/auth.js'
import useSession from './store/session.js'

// ── ProtectedRoute ────────────────────────────────────────────────────────────
function ProtectedRoute({ children }) {
  const [checked, setChecked] = useState(false)
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthed(!!session)
      setChecked(true)
    })
  }, [])

  if (!checked) return null
  if (!authed) return <Navigate to="/auth" replace />
  return children
}

// ── BrandingLoader — fetches branding on mount for authenticated users ────────
function BrandingLoader() {
  const { setBranding, setUserPlan } = useSession()

  useEffect(() => {
    async function load() {
      const token = await getToken()
      if (!token) return
      try {
        const [statusRes, brandRes] = await Promise.all([
          fetch('/auth/status', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/user/branding', { headers: { Authorization: `Bearer ${token}` } }),
        ])
        if (statusRes.ok) {
          const { plan } = await statusRes.json()
          setUserPlan(plan || 'free')
        }
        if (brandRes.ok) {
          const { logoUrl, accentColor } = await brandRes.json()
          setBranding({ logoUrl: logoUrl || null, accentColor: accentColor || '#22d3ee' })
          if (accentColor && accentColor !== '#22d3ee') {
            document.documentElement.style.setProperty('--color-accent', accentColor)
          }
        }
      } catch {}
    }
    load()
  }, [setBranding, setUserPlan])

  return null
}

function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-zinc-200 text-lg font-mono">Page not found</h1>
      <a href="/" className="px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 text-sm font-mono hover:bg-zinc-800">
        Back to home
      </a>
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <BrandingLoader />
        <Routes>
          {/* Public marketing page */}
          <Route path="/" element={<Landing />} />

          {/* Auth */}
          <Route path="/auth" element={<AuthPage />} />

          {/* Authenticated app entry */}
          <Route path="/app" element={
            <ProtectedRoute><AppLanding /></ProtectedRoute>
          } />

          {/* Session rooms — host requires auth, guest is public */}
          <Route path="/room/:sessionId/host" element={
            <ProtectedRoute><HostRoom /></ProtectedRoute>
          } />
          <Route path="/room/:sessionId" element={<GuestRoom />} />

          {/* Join shortcut */}
          <Route path="/join/:code" element={<JoinPage />} />

          {/* Dashboard & settings */}
          <Route path="/dashboard" element={
            <ProtectedRoute><Dashboard /></ProtectedRoute>
          } />
          <Route path="/settings" element={
            <ProtectedRoute><Settings /></ProtectedRoute>
          } />

          {/* Admin */}
          <Route path="/admin" element={<AdminDashboard />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}
