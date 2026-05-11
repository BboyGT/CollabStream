import { useEffect, useRef, useCallback } from 'react'
import useSession from '../store/session.js'

const COMPANION_URL = 'ws://localhost:7734'

export default function useCompanion() {
  const wsRef = useRef(null)
  const { setCompanionConnected, role } = useSession()
  const mountedRef = useRef(true)

  const connect = useCallback(() => {
    if (role !== 'host') return
    try {
      const ws = new WebSocket(COMPANION_URL)
      wsRef.current = ws

      ws.onopen = () => setCompanionConnected(true)
      ws.onclose = () => {
        setCompanionConnected(false)
        if (!mountedRef.current) return
        // Retry every 3s — companion may not be open yet
        setTimeout(connect, 3000)
      }
      ws.onerror = () => ws.close()
    } catch {
      setTimeout(connect, 3000)
    }
  }, [role, setCompanionConnected])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      wsRef.current?.close()
    }
  }, [connect])

  // Arm companion with session token before control grant
  const arm = useCallback((token) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'arm', token }))
    }
  }, [])

  // Disarm — revoke control
  const disarm = useCallback(() => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'disarm' }))
    }
  }, [])

  // Forward input events to companion (host receives these from guest via data channel)
  const forwardInput = useCallback((token, inputEvent) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', token, ...inputEvent }))
    }
  }, [])

  return { arm, disarm, forwardInput }
}
