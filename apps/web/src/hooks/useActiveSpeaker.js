import { useEffect, useRef, useState } from 'react'

// Samples audio levels from a set of MediaStreams via the Web Audio API and
// reports which ones are currently "speaking" (RMS level above a threshold,
// with a short hold time so a brief pause mid-sentence doesn't flicker the
// indicator off). Client-side only, no new dependency — AnalyserNode is a
// standard Web Audio API feature.
//
// `streams` is an object of peerId -> MediaStream (e.g. HostRoom's
// `guestStreams`). Returns a Set of peerIds currently considered "speaking."
export default function useActiveSpeaker(streams, { threshold = 0.02, holdMs = 500, intervalMs = 150 } = {}) {
  const [speaking, setSpeaking] = useState(() => new Set())
  const ctxRef = useRef(null)
  const entriesRef = useRef(new Map()) // peerId -> { analyser, data, source, lastAbove }

  // Keep analysers in sync with the current set of streams.
  useEffect(() => {
    if (!ctxRef.current) {
      try {
        ctxRef.current = new (window.AudioContext || window.webkitAudioContext)()
      } catch {
        return // Web Audio unsupported — indicator just stays empty, nothing else breaks
      }
    }
    const ctx = ctxRef.current
    const known = entriesRef.current

    Object.entries(streams || {}).forEach(([peerId, stream]) => {
      if (known.has(peerId)) return
      const audioTracks = stream?.getAudioTracks?.() || []
      if (!audioTracks.length) return
      try {
        // A dedicated single-track MediaStream, not the original — avoids
        // pulling video decode overhead into the audio graph for nothing.
        const source = ctx.createMediaStreamSource(new MediaStream([audioTracks[0]]))
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        analyser.smoothingTimeConstant = 0.6
        source.connect(analyser)
        known.set(peerId, { analyser, data: new Uint8Array(analyser.frequencyBinCount), source, lastAbove: 0 })
      } catch {}
    })

    const currentIds = new Set(Object.keys(streams || {}))
    known.forEach((entry, peerId) => {
      if (!currentIds.has(peerId)) {
        try { entry.source.disconnect() } catch {}
        known.delete(peerId)
      }
    })
  }, [streams])

  // Polling loop — deliberately setTimeout-based rather than
  // requestAnimationFrame, since this needs to keep sampling even when the
  // tab/element isn't visually active, and doesn't need 60fps precision for
  // a 500ms-hold speaking indicator.
  useEffect(() => {
    let stopped = false
    let timer = null
    function tick() {
      if (stopped) return
      const now = Date.now()
      const next = new Set()
      entriesRef.current.forEach((entry, peerId) => {
        entry.analyser.getByteTimeDomainData(entry.data)
        let sumSquares = 0
        for (let i = 0; i < entry.data.length; i++) {
          const v = (entry.data[i] - 128) / 128
          sumSquares += v * v
        }
        const rms = Math.sqrt(sumSquares / entry.data.length)
        if (rms > threshold) entry.lastAbove = now
        if (now - entry.lastAbove < holdMs) next.add(peerId)
      })
      setSpeaking((prev) => {
        if (prev.size === next.size && [...prev].every((id) => next.has(id))) return prev
        return next
      })
      timer = setTimeout(tick, intervalMs)
    }
    tick()
    return () => { stopped = true; if (timer) clearTimeout(timer) }
  }, [threshold, holdMs, intervalMs])

  useEffect(() => () => {
    entriesRef.current.forEach((entry) => { try { entry.source.disconnect() } catch {} })
    entriesRef.current.clear()
    try { ctxRef.current?.close() } catch {}
  }, [])

  return speaking
}
