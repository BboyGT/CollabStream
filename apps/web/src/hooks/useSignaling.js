import { useEffect, useRef, useCallback, useState } from 'react'
import useSession from '../store/session.js'

const DEFAULT_SIGNAL_URL = (() => {
  if (typeof window === 'undefined') return 'ws://localhost:3001/ws'
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}/ws`
})()
const SIGNAL_URL = import.meta.env.VITE_SIGNAL_URL || DEFAULT_SIGNAL_URL
const MAX_RETRIES = 5

export default function useSignaling(sessionId, role, onMessage, guestName = '') {
  const wsRef = useRef(null)
  const retriesRef = useRef(0)
  const mountedRef = useRef(true)
  const onMessageRef = useRef(onMessage)
  const connectRef = useRef(null)
  const [retryCount, setRetryCount] = useState(0)
  const { setSignalingConnected, setPeerId, setGuestCount, sessionToken } = useSession()

  onMessageRef.current = onMessage

  const connect = useCallback(() => {
    if (!mountedRef.current || !sessionId || !role || !sessionToken) return

    // Close existing connection cleanly before reconnecting
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      wsRef.current.onclose = null
      wsRef.current.close()
    }

    const ws = new WebSocket(SIGNAL_URL)
    wsRef.current = ws

    ws.onopen = () => {
      retriesRef.current = 0
      setRetryCount(0)
      setSignalingConnected(true)
      const registerName = guestName || (role === 'guest' ? localStorage.getItem('cs_name') : '')
      ws.send(JSON.stringify({ type: 'register', sessionId, role, token: sessionToken, guestName: registerName }))
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        // Pre-launch lobby (docs/pre-launch-lobby-plan.md): a lobby guest
        // gets 'lobby-joined' instead of 'registered' (they haven't been
        // admitted to anything yet), and later 'session-started' instead of
        // a second 'registered' once the host starts the call — neither of
        // those message types was previously captured here, so a lobby-
        // origin guest's own peerId would never get set in the session
        // store at all, breaking anything that compares against it (e.g.
        // "is this me" checks in a roster).
        if ((msg.type === 'registered' || msg.type === 'lobby-joined' || msg.type === 'session-started') && msg.peerId) setPeerId(msg.peerId)
        if (msg.type === 'peer-joined' && typeof msg.guestCount === 'number') setGuestCount(msg.guestCount)
        if (msg.type === 'peer-left' && typeof msg.guestCount === 'number') setGuestCount(msg.guestCount)
        onMessageRef.current?.(msg)
      } catch {
        console.warn('Bad signaling message', e.data)
      }
    }

    ws.onclose = () => {
      setSignalingConnected(false)
      if (!mountedRef.current) return
      if (retriesRef.current >= MAX_RETRIES) {
        console.error('Signaling: max retries reached')
        setRetryCount(retriesRef.current)
        return
      }
      retriesRef.current++
      setRetryCount(retriesRef.current)
      const delay = Math.min(1000 * 2 ** (retriesRef.current - 1), 16000)
      console.log(`Signaling: reconnecting in ${delay}ms (attempt ${retriesRef.current}/${MAX_RETRIES})`)
      setTimeout(() => connectRef.current?.(), delay)
    }

    ws.onerror = (err) => {
      console.error('Signaling WS error:', err)
      ws.close()
    }
  }, [sessionId, role, sessionToken, guestName, setSignalingConnected, setPeerId, setGuestCount])

  // Keep ref current so the closure inside onclose always calls the latest connect
  connectRef.current = connect

  const send = useCallback((msg) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }, [])

  // Manual retry: reset counter and connect immediately
  const manualRetry = useCallback(() => {
    retriesRef.current = 0
    setRetryCount(0)
    connect()
  }, [connect])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      wsRef.current?.close()
    }
  }, [connect])

  return { send, retryCount, manualRetry, maxRetries: MAX_RETRIES }
}
