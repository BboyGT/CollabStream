import { useEffect, useRef, useCallback } from 'react'
import { createPeerConnection } from '../lib/webrtc.js'
import useSession from '../store/session.js'

export default function useWebRTC({ role, localStream, screenStream, onDataChannel, onMessage, allowGuestOffers = false }) {
  const pcRef = useRef(null)
  const dataChannels = useRef({}) // { annotation, control }
  const { setRemoteStream, setRemoteScreenStream, setRemoteMeta, setPeerConnected, remoteScreenStreamId } = useSession()
  const signalingRef = useRef(null)
  const makingOfferRef = useRef(false)
  const lastScreenIdRef = useRef(null)

  const setSignalSend = useCallback((fn) => {
    signalingRef.current = fn
  }, [])

  const signal = useCallback((msg) => {
    signalingRef.current?.(msg)
  }, [])

  const renegotiate = useCallback(async () => {
    const pc = pcRef.current
    if (!pc) return
    if (pc.signalingState !== 'stable') return
    if (role === 'guest' && !allowGuestOffers) return
    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      const payload = { type: 'offer', sdp: pc.localDescription }
      if (role === 'guest') payload.targetPeerId = 'host'
      signal(payload)
    } catch (err) {
      console.warn('Renegotiate failed', err)
    }
  }, [role, allowGuestOffers, signal])

  const initPC = useCallback(() => {
    const pc = createPeerConnection()
    pcRef.current = pc

    if (localStream) {
      localStream.getTracks().forEach((t) => pc.addTrack(t, localStream))
    }
    if (screenStream) {
      screenStream.getTracks().forEach((t) => pc.addTrack(t, screenStream))
    }

    if (role === 'host') {
      const annotation = pc.createDataChannel('annotation', { ordered: true })
      const control = pc.createDataChannel('control', { ordered: false, maxRetransmits: 0 })
      dataChannels.current = { annotation, control }
      setupDataChannel(annotation, 'annotation')
      setupDataChannel(control, 'control')

      annotation.onopen = () => {
        annotation.send(JSON.stringify({
          type: 'meta',
          screenWidth: window.screen.width,
          screenHeight: window.screen.height,
        }))
        onDataChannel?.({ annotation, control })
      }
    }

    pc.ondatachannel = (e) => {
      const ch = e.channel
      dataChannels.current[ch.label] = ch
      setupDataChannel(ch, ch.label)
      // Call after EACH channel — caller receives progressively richer object.
      // Removed the length === 2 guard: if channels arrive out of order or only
      // one arrives, the callback must still fire so messages are not silently dropped.
      onDataChannel?.(dataChannels.current)
    }

    pc.ontrack = (e) => {
      const [stream] = e.streams
      const track = e.track
      if (!stream) return

      if (track.kind === 'video') {
        const label = (track.label || '').toLowerCase()
        const settings = typeof track.getSettings === 'function' ? track.getSettings() : null
        const isScreenHint =
          (settings && settings.displaySurface) ||
          label.includes('screen') ||
          label.includes('window') ||
          label.includes('display') ||
          label.includes('monitor')

        const current = useSession.getState()
        const hasRemoteVideo = current.remoteStream?.getVideoTracks?.().length > 0
        const hasScreen = current.remoteScreenStream?.getVideoTracks?.().length > 0
        const isScreenById = remoteScreenStreamId && stream.id === remoteScreenStreamId
        const isScreen = isScreenById || isScreenHint || (hasRemoteVideo && !hasScreen)

        if (isScreen) setRemoteScreenStream(stream)
        else setRemoteStream(stream)
        return
      }

      if (track.kind === 'audio') {
        const hasVideo = stream.getVideoTracks?.().length > 0
        const current = useSession.getState().remoteStream
        if (!current || hasVideo) {
          setRemoteStream(stream)
        }
      }
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        const payload = { type: 'ice-candidate', candidate: e.candidate }
        if (role === 'guest') payload.targetPeerId = 'host'
        signal(payload)
      }
    }

    pc.onnegotiationneeded = async () => {
      if (pc.signalingState !== 'stable') return
      if (role === 'guest' && !allowGuestOffers) return
      makingOfferRef.current = true
      try {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        const payload = { type: 'offer', sdp: pc.localDescription }
        if (role === 'guest') payload.targetPeerId = 'host'
        signal(payload)
      } catch (err) {
        console.warn('Renegotiation failed', err)
      } finally {
        makingOfferRef.current = false
      }
    }

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState
      setPeerConnected(state === 'connected')
      if (state === 'failed') pc.restartIce()
      if (state === 'disconnected') {
        setTimeout(() => {
          try { pc.restartIce() } catch {}
        }, 1500)
      }
    }

    return pc
  }, [role, localStream, screenStream, signal, setRemoteStream, setPeerConnected, onDataChannel])

  function setupDataChannel(ch, label) {
    ch.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'meta') setRemoteMeta(msg)
        onMessage?.(msg, label)
      } catch {}
    }
  }

  const handleSignal = useCallback(async (msg) => {
    let pc = pcRef.current
    if (!pc && (msg.type === 'offer' || msg.type === 'peer-joined')) {
      pc = initPC()
    }
    if (!pc) return

    if (msg.type === 'peer-joined' && role === 'host') {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      const payload = { type: 'offer', sdp: pc.localDescription }
      signal(payload)
    }

    if (msg.type === 'offer' && role === 'guest') {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      const payload = { type: 'answer', sdp: pc.localDescription, targetPeerId: 'host' }
      signal(payload)
    }

    if (msg.type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
    }

    if (msg.type === 'ice-candidate') {
      try {
        if (msg.candidate) {
          // Valid ICE candidate — wrap and add
          await pc.addIceCandidate(new RTCIceCandidate(msg.candidate))
        } else {
          // null candidate = end-of-gathering signal; must NOT wrap in RTCIceCandidate()
          await pc.addIceCandidate(null)
        }
      } catch {}
    }
  }, [role, initPC, signal])

  useEffect(() => {
    const pc = pcRef.current
    if (!pc || !localStream) return
    if (pc.signalingState === 'closed') return
    const senders = pc.getSenders().map((s) => s.track?.id).filter(Boolean)
    localStream.getTracks().forEach((t) => {
      if (!senders.includes(t.id)) {
        try { pc.addTrack(t, localStream) } catch {}
      }
    })
  }, [localStream])

  useEffect(() => {
    const pc = pcRef.current
    if (!pc || !screenStream) return
    if (screenStream.id === lastScreenIdRef.current) return
    lastScreenIdRef.current = screenStream.id
    if (pc.signalingState === 'closed') return
    const senders = pc.getSenders().map((s) => s.track?.id).filter(Boolean)
    screenStream.getTracks().forEach((t) => {
      if (!senders.includes(t.id)) {
        try { pc.addTrack(t, screenStream) } catch {}
      }
    })
  }, [screenStream])

  const sendData = useCallback((channelName, msg) => {
    const ch = dataChannels.current[channelName]
    if (ch && ch.readyState === 'open') {
      ch.send(JSON.stringify(msg))
    }
  }, [])

  const addScreenTrack = useCallback((stream) => {
    const pc = pcRef.current
    if (!pc) return
    stream.getTracks().forEach((t) => pc.addTrack(t, stream))
  }, [])

  useEffect(() => {
    return () => {
      pcRef.current?.close()
    }
  }, [])

  const getStats = useCallback(async () => {
    const pc = pcRef.current
    if (!pc) return null
    try { return await pc.getStats() } catch { return null }
  }, [])

  return { handleSignal, sendData, setSignalSend, addScreenTrack, getStats, renegotiate }
}
