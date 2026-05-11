import { useCallback, useRef, useEffect } from 'react'
import { createPeerConnection } from '../lib/webrtc.js'

export default function useWebRTCHost({ localStream, screenStream, onDataChannel, onMessage, onPeerStream, onPeerState }) {
  const pcsRef = useRef(new Map()) // peerId -> RTCPeerConnection
  const channelsRef = useRef(new Map()) // peerId -> { annotation, control }
  const signalingRef = useRef(null)
  const makingOfferRef = useRef(new Map()) // peerId -> boolean
  // FIX: pending promise map prevents duplicate PCs when two peer-joined
  // events fire before either async createPC call resolves (race condition).
  const pendingRef = useRef(new Map()) // peerId -> Promise<RTCPeerConnection>

  const setSignalSend = useCallback((fn) => {
    signalingRef.current = fn
  }, [])

  const signal = useCallback((msg) => {
    signalingRef.current?.(msg)
  }, [])

  const _actuallyCreatePC = useCallback(async (peerId) => {
    const pc = createPeerConnection()
    pcsRef.current.set(peerId, pc)

    if (localStream) localStream.getTracks().forEach((t) => pc.addTrack(t, localStream))
    if (screenStream) screenStream.getTracks().forEach((t) => pc.addTrack(t, screenStream))

    const annotation = pc.createDataChannel('annotation', { ordered: true })
    const control = pc.createDataChannel('control', { ordered: false, maxRetransmits: 0 })
    channelsRef.current.set(peerId, { annotation, control })
    onDataChannel?.(peerId, { annotation, control })

    annotation.onopen = () => {
      annotation.send(JSON.stringify({
        type: 'meta',
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
      }))
    }

    pc.ondatachannel = (e) => {
      const ch = e.channel
      const existing = channelsRef.current.get(peerId) || {}
      existing[ch.label] = ch
      channelsRef.current.set(peerId, existing)
      onDataChannel?.(peerId, existing)
    }

    pc.ontrack = (e) => {
      const [stream] = e.streams
      if (stream) onPeerStream?.(peerId, stream, e.track)
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        signal({ type: 'ice-candidate', candidate: e.candidate, targetPeerId: peerId })
      }
    }

    pc.onnegotiationneeded = async () => {
      if (pc.signalingState !== 'stable') return
      makingOfferRef.current.set(peerId, true)
      try {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        signal({ type: 'offer', sdp: pc.localDescription, targetPeerId: peerId })
      } catch (err) {
        console.warn('Host renegotiation failed', err)
      } finally {
        makingOfferRef.current.set(peerId, false)
      }
    }

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState
      onPeerState?.(peerId, state)
      if (state === 'failed') pc.restartIce()
      if (state === 'disconnected') {
        setTimeout(() => {
          try { pc.restartIce() } catch {}
        }, 1500)
      }
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    signal({ type: 'offer', sdp: pc.localDescription, targetPeerId: peerId })
    return pc
  }, [localStream, screenStream, onDataChannel, onPeerStream, onPeerState, signal])

  const createPC = useCallback(async (peerId) => {
    // Return existing PC if already created
    if (pcsRef.current.has(peerId)) return pcsRef.current.get(peerId)

    // Return in-flight promise if creation is already in progress.
    // This is the race condition fix: two rapid peer-joined events both
    // pass the has() check above but only one creation runs.
    if (pendingRef.current.has(peerId)) return pendingRef.current.get(peerId)

    const promise = _actuallyCreatePC(peerId)
    pendingRef.current.set(peerId, promise)
    try {
      const pc = await promise
      return pc
    } finally {
      pendingRef.current.delete(peerId)
    }
  }, [_actuallyCreatePC])

  const handleSignal = useCallback(async (msg) => {
    if (msg.type === 'peer-joined' && msg.peerId) {
      await createPC(msg.peerId)
      return
    }

    const peerId = msg.fromPeerId
    if (!peerId) return
    const pc = pcsRef.current.get(peerId)
    if (!pc) return

    if (msg.type === 'ready') {
      const readyPc = pcsRef.current.get(peerId) || (await createPC(peerId))
      if (readyPc && readyPc.signalingState === 'stable') {
        const offer = await readyPc.createOffer()
        await readyPc.setLocalDescription(offer)
        signal({ type: 'offer', sdp: readyPc.localDescription, targetPeerId: peerId })
      }
    }

    if (msg.type === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      signal({ type: 'answer', sdp: pc.localDescription, targetPeerId: peerId })
    }

    if (msg.type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
    }

    if (msg.type === 'ice-candidate') {
      try {
        if (msg.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(msg.candidate))
        } else {
          await pc.addIceCandidate(null)
        }
      } catch {}
    }
  }, [createPC, signal])

  useEffect(() => {
    if (!localStream) return
    pcsRef.current.forEach((pc) => {
      if (pc.signalingState === 'closed') return
      const senders = pc.getSenders().map((s) => s.track?.id).filter(Boolean)
      localStream.getTracks().forEach((t) => {
        if (!senders.includes(t.id)) {
          try { pc.addTrack(t, localStream) } catch {}
        }
      })
    })
  }, [localStream])

  useEffect(() => {
    if (!screenStream) return
    pcsRef.current.forEach((pc) => {
      if (pc.signalingState === 'closed') return
      const senders = pc.getSenders().map((s) => s.track?.id).filter(Boolean)
      screenStream.getTracks().forEach((t) => {
        if (!senders.includes(t.id)) {
          try { pc.addTrack(t, screenStream) } catch {}
        }
      })
    })
  }, [screenStream])

  const sendToPeer = useCallback((peerId, channel, msg) => {
    const ch = channelsRef.current.get(peerId)?.[channel]
    if (ch && ch.readyState === 'open') ch.send(JSON.stringify(msg))
  }, [])

  const broadcast = useCallback((channel, msg, exceptPeerId) => {
    channelsRef.current.forEach((chs, peerId) => {
      if (exceptPeerId && peerId === exceptPeerId) return
      const ch = chs?.[channel]
      if (ch && ch.readyState === 'open') ch.send(JSON.stringify(msg))
    })
  }, [])

  const addScreenTrack = useCallback((stream) => {
    pcsRef.current.forEach((pc) => {
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))
    })
  }, [])

  const closePeer = useCallback((peerId) => {
    const pc = pcsRef.current.get(peerId)
    if (pc) pc.close()
    pcsRef.current.delete(peerId)
    channelsRef.current.delete(peerId)
  }, [])

  const setRemoteAudio = useCallback((peerId, enabled) => {
    const pc = pcsRef.current.get(peerId)
    if (!pc) return
    pc.getReceivers().forEach((r) => {
      if (r.track && r.track.kind === 'audio') {
        r.track.enabled = enabled
      }
    })
  }, [])

  const getStats = useCallback(async (peerId) => {
    const pc = pcsRef.current.get(peerId)
    if (!pc) return null
    try { return await pc.getStats() } catch { return null }
  }, [])

  return { handleSignal, setSignalSend, sendToPeer, broadcast, addScreenTrack, closePeer, setRemoteAudio, createPC, getStats }
}
