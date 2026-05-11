import { useEffect, useState, useCallback } from 'react'

const RELAY_URL = 'ws://127.0.0.1:7734'
const POLL_INTERVAL_MS = 2000

/**
 * CollabStream Companion — status UI
 *
 * Shows live relay state: connected, armed/disarmed, input scope, pause state.
 * Polls the relay's "status" message every 2 s while connected.
 */
export default function App() {
  const [connected, setConnected] = useState(false)
  const [armed, setArmed] = useState(false)
  const [paused, setPaused] = useState(false)
  const [mouse, setMouse] = useState(true)
  const [keyboard, setKeyboard] = useState(true)
  const [wsRef] = useState({ current: null })

  const applyStatus = useCallback((data) => {
    if (typeof data.armed === 'boolean') setArmed(data.armed)
    if (typeof data.paused === 'boolean') setPaused(data.paused)
    if (typeof data.mouse === 'boolean') setMouse(data.mouse)
    if (typeof data.keyboard === 'boolean') setKeyboard(data.keyboard)
  }, [])

  useEffect(() => {
    let ws = null
    let pollTimer = null
    let reconnectTimer = null
    let destroyed = false

    function connect() {
      if (destroyed) return
      ws = new WebSocket(RELAY_URL)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        // Immediately request current status
        ws.send(JSON.stringify({ type: 'status' }))
        // Poll status every 2 s to keep UI in sync
        pollTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'status' }))
          }
        }, POLL_INTERVAL_MS)
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'status') applyStatus(msg)
          if (msg.type === 'armed') setArmed(true)
          if (msg.type === 'disarmed') setArmed(false)
          if (msg.type === 'paused') setPaused(true)
          if (msg.type === 'resumed') setPaused(false)
        } catch {}
      }

      ws.onclose = () => {
        setConnected(false)
        setArmed(false)
        setPaused(false)
        clearInterval(pollTimer)
        wsRef.current = null
        if (!destroyed) {
          reconnectTimer = setTimeout(connect, 3000)
        }
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      destroyed = true
      clearInterval(pollTimer)
      clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [applyStatus])

  function scopeLabel() {
    if (mouse && keyboard) return 'Mouse + Keyboard'
    if (mouse) return 'Mouse Only'
    if (keyboard) return 'Keyboard Only'
    return 'No Input'
  }

  const dot = (active, color = '#22d3ee') => ({
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: active ? color : 'rgba(255,255,255,0.1)',
    marginRight: 8,
    flexShrink: 0,
  })

  const row = {
    display: 'flex',
    alignItems: 'center',
    padding: '9px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    fontSize: 12,
    fontFamily: 'monospace',
    color: 'rgba(255,255,255,0.75)',
    gap: 4,
  }

  const label = {
    color: 'rgba(255,255,255,0.35)',
    minWidth: 110,
    flexShrink: 0,
  }

  const value = (active, activeColor = '#22d3ee') => ({
    color: active ? activeColor : 'rgba(255,255,255,0.4)',
    fontWeight: active ? 600 : 400,
  })

  return (
    <div style={{
      minHeight: '100vh',
      background: '#09090b',
      color: '#e2e8f0',
      fontFamily: 'monospace',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '14px 16px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <div style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: 'linear-gradient(135deg, rgba(34,211,238,0.25), rgba(100,200,255,0.1))',
          border: '1px solid rgba(34,211,238,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 700,
          color: '#22d3ee',
          letterSpacing: '0.5px',
        }}>
          CS
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', letterSpacing: 1 }}>
            CollabStream Companion
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: 2 }}>
            INPUT RELAY
          </div>
        </div>
      </div>

      {/* Status rows */}
      <div style={{ flex: 1, padding: '8px 0' }}>

        {/* Relay connection */}
        <div style={row}>
          <span style={dot(connected, '#34d399')} />
          <span style={label}>Relay</span>
          <span style={value(connected, '#34d399')}>
            {connected ? 'Connected on :7734' : 'Waiting for connection\u2026'}
          </span>
        </div>

        {/* Armed state */}
        <div style={row}>
          <span style={dot(armed, '#22d3ee')} />
          <span style={label}>Session</span>
          <span style={value(armed, '#22d3ee')}>
            {armed ? 'Armed' : (connected ? 'Waiting for session' : '\u2014')}
          </span>
        </div>

        {/* Pause state */}
        <div style={row}>
          <span style={dot(paused, '#f59e0b')} />
          <span style={label}>Input</span>
          <span style={value(paused, '#f59e0b')}>
            {paused ? 'Paused' : (armed ? 'Active' : '\u2014')}
          </span>
        </div>

        {/* Scope */}
        <div style={row}>
          <span style={dot(armed && (mouse || keyboard), '#a78bfa')} />
          <span style={label}>Scope</span>
          <span style={value(armed && (mouse || keyboard), '#a78bfa')}>
            {armed ? scopeLabel() : '\u2014'}
          </span>
        </div>

      </div>

      {/* Tray hint */}
      <div style={{
        padding: '10px 16px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        fontSize: 10,
        color: 'rgba(255,255,255,0.2)',
        letterSpacing: 1,
      }}>
        Right-click tray icon to control &nbsp;&middot;&nbsp; Ctrl+Shift+P to toggle pause
      </div>

      {/* GTA attribution */}
      <div style={{
        padding: '6px 16px 12px',
        textAlign: 'center',
        fontSize: 11,
        color: 'rgba(34,211,238,0.25)',
        fontFamily: 'monospace',
        letterSpacing: 2,
        textTransform: 'uppercase',
      }}>
        CollabStream Companion &mdash; built by Godstime Aburu
      </div>
    </div>
  )
}
