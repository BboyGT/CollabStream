import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
  StyleSheet,
  Platform,
} from 'react-native'
import {
  RTCPeerConnection,
  RTCView,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
} from 'react-native-webrtc'
import { WS_URL } from './config'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

function generatePeerId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export default function RoomScreen({ route, navigation }) {
  const { sessionId, token, name } = route.params

  const [localStream, setLocalStream] = useState(null)
  const [remoteStream, setRemoteStream] = useState(null)
  const [status, setStatus] = useState('connecting')
  const [error, setError] = useState(null)
  const [micMuted, setMicMuted] = useState(false)
  const [camOff, setCamOff] = useState(false)

  const wsRef = useRef(null)
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const peerIdRef = useRef(generatePeerId())
  const mountedRef = useRef(true)
  const leavingRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    leavingRef.current = false

    async function ensurePeerConnection() {
      if (pcRef.current) return pcRef.current
      try {
        const stream = await mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: 640, height: 480, frameRate: 30 },
          audio: { echoCancellation: true, noiseSuppression: true },
        })
        if (!mountedRef.current) { stream.getTracks().forEach((t) => t.stop()); return }
        setLocalStream(stream)
        localStreamRef.current = stream

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
        pcRef.current = pc

        stream.getTracks().forEach((t) => pc.addTrack(t, stream))

        pc.ontrack = (e) => {
          if (!mountedRef.current) return
          if (e.streams?.[0]) setRemoteStream(e.streams[0])
        }

        pc.onicecandidate = (e) => {
          if (e.candidate && wsRef.current?.readyState === 1) {
            wsRef.current.send(JSON.stringify({
              type: 'ice-candidate',
              candidate: e.candidate,
              targetPeerId: 'host',
            }))
          }
        }

        pc.onconnectionstatechange = () => {
          if (!mountedRef.current) return
          const s = pc.connectionState
          if (s === 'connected') setStatus('connected')
          else if (s === 'failed') setStatus('failed')
          else if (s === 'disconnected') setStatus('disconnected')
        }

        return pc
      } catch (err) {
        if (mountedRef.current) setError('Camera or microphone permission denied.')
        return null
      }
    }

    async function sendReady() {
      const pc = await ensurePeerConnection()
      if (pc && wsRef.current?.readyState === 1) {
        wsRef.current.send(JSON.stringify({ type: 'ready' }))
      }
    }

    function setup() {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        if (!mountedRef.current) return
        ws.send(JSON.stringify({
          type: 'register',
          sessionId,
          role: 'guest',
          peerId: peerIdRef.current,
          token,
          guestName: name || 'Mobile Guest',
        }))
      }

      ws.onmessage = async (e) => {
        if (!mountedRef.current) return
        try {
          const msg = JSON.parse(e.data)

          if (msg.type === 'error') {
            setError(msg.message || 'Connection error')
            return
          }
          if (msg.type === 'registered') {
            setStatus('waiting')
            await sendReady()
            return
          }
          if (msg.type === 'lobby-joined') {
            setStatus('lobby')
            return
          }
          if (msg.type === 'session-started') {
            setStatus('waiting')
            await sendReady()
            return
          }
          if (msg.type === 'pending-approval') {
            setStatus('pending')
            return
          }
          if (msg.type === 'admitted') {
            setStatus('waiting')
            await sendReady()
            return
          }
          if (msg.type === 'knock-rejected') {
            setError('Host declined your request')
            return
          }
          if (msg.type === 'peer-left') {
            setStatus('host-left')
            return
          }
          if (msg.type === 'offer') {
            const pc = await ensurePeerConnection()
            if (!pc) return
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            ws.send(JSON.stringify({
              type: 'answer',
              sdp: pc.localDescription,
              targetPeerId: 'host',
            }))
          }
          if (msg.type === 'answer') {
            const pc = await ensurePeerConnection()
            if (pc) await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
          }
          if (msg.type === 'ice-candidate' && msg.candidate) {
            const pc = pcRef.current
            if (pc) await pc.addIceCandidate(new RTCIceCandidate(msg.candidate))
          }
        } catch {}
      }

      ws.onerror = () => {
        if (mountedRef.current) setError('Could not connect to server. Check EXPO_PUBLIC_SERVER_URL.')
      }
      ws.onclose = () => {
        if (mountedRef.current && !leavingRef.current) setStatus('disconnected')
      }
    }

    setup()

    return () => {
      mountedRef.current = false
      leavingRef.current = true
      localStreamRef.current?.getTracks().forEach((t) => t.stop())
      pcRef.current?.close()
      wsRef.current?.close()
    }
  }, [name, sessionId, token])

  function toggleMic() {
    const track = localStreamRef.current?.getAudioTracks?.()?.[0]
    if (!track) return
    track.enabled = !track.enabled
    setMicMuted(!track.enabled)
  }

  function toggleCam() {
    const track = localStreamRef.current?.getVideoTracks?.()?.[0]
    if (!track) return
    track.enabled = !track.enabled
    setCamOff(!track.enabled)
  }

  function handleLeave() {
    leavingRef.current = true
    setStatus('leaving')
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    pcRef.current?.close()
    wsRef.current?.close()
    navigation.goBack()
  }

  const statusLabel = {
    connecting: 'Connecting\u2026',
    waiting: 'Waiting for host\u2026',
    lobby: 'Waiting for host to start\u2026',
    connected: 'Connected',
    pending: 'Waiting for host to admit you\u2026',
    failed: 'Connection failed',
    'host-left': 'Host left the session',
    disconnected: 'Disconnected',
    leaving: '',
  }[status] || 'Connecting\u2026'

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#09090b" />

      {/* Remote video — full screen */}
      {remoteStream ? (
        <RTCView
          streamURL={remoteStream.toURL()}
          style={StyleSheet.absoluteFill}
          objectFit="cover"
          zOrder={0}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.waitingBg]}>
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>CS</Text>
          </View>
          <Text style={styles.waitingText}>{statusLabel}</Text>
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>
      )}

      {/* Local video PiP — bottom right */}
      {localStream && !camOff && (
        <View style={styles.localTile}>
          <RTCView
            streamURL={localStream.toURL()}
            style={{ flex: 1, borderRadius: 10 }}
            objectFit="cover"
            zOrder={1}
            mirror={true}
          />
        </View>
      )}

      {/* Name badge — bottom left */}
      {name ? (
        <View style={styles.nameBadge}>
          <Text style={styles.nameBadgeText}>{name}</Text>
        </View>
      ) : null}

      {/* Status pill — top center (only when not connected) */}
      {status !== 'connected' && !error && status !== 'leaving' && (
        <View style={styles.statusBar}>
          <Text style={styles.statusText}>{statusLabel}</Text>
        </View>
      )}

      {/* Controls row */}
      <View style={styles.controls}>
        {/* Mic */}
        <TouchableOpacity
          style={[styles.controlBtn, micMuted && styles.controlBtnActive]}
          onPress={toggleMic}
        >
          <Text style={[styles.controlIcon, micMuted && styles.controlIconActive]}>
            {micMuted ? '\uD83D\uDD07' : '\uD83C\uDFA4'}
          </Text>
          <Text style={[styles.controlLabel, micMuted && styles.controlLabelActive]}>
            {micMuted ? 'Muted' : 'Mic'}
          </Text>
        </TouchableOpacity>

        {/* Leave */}
        <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave}>
          <Text style={styles.leaveBtnText}>Leave</Text>
        </TouchableOpacity>

        {/* Camera */}
        <TouchableOpacity
          style={[styles.controlBtn, camOff && styles.controlBtnActive]}
          onPress={toggleCam}
        >
          <Text style={[styles.controlIcon, camOff && styles.controlIconActive]}>
            {camOff ? '\uD83D\uDEAB' : '\uD83D\uDCF7'}
          </Text>
          <Text style={[styles.controlLabel, camOff && styles.controlLabelActive]}>
            {camOff ? 'Cam Off' : 'Camera'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace'

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  waitingBg: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#09090b',
    gap: 16,
  },
  logoBox: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: 'rgba(34,211,238,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  logoText: {
    color: '#22d3ee',
    fontSize: 22,
    fontFamily: MONO,
    fontWeight: '700',
  },
  waitingText: {
    color: '#94a3b8',
    fontFamily: MONO,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  errorText: {
    color: '#fca5a5',
    fontFamily: MONO,
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  localTile: {
    position: 'absolute',
    bottom: 90,
    right: 12,
    width: 100,
    height: 140,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    zIndex: 10,
  },
  nameBadge: {
    position: 'absolute',
    bottom: 90,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
    zIndex: 10,
  },
  nameBadgeText: {
    color: '#e2e8f0',
    fontSize: 11,
    fontFamily: MONO,
  },
  statusBar: {
    position: 'absolute',
    top: 56,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingVertical: 5,
    paddingHorizontal: 16,
    borderRadius: 99,
    zIndex: 20,
  },
  statusText: {
    color: '#94a3b8',
    fontSize: 11,
    fontFamily: MONO,
  },
  controls: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    zIndex: 20,
    paddingHorizontal: 24,
  },
  controlBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30,41,59,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minWidth: 72,
  },
  controlBtnActive: {
    backgroundColor: 'rgba(127,29,29,0.75)',
    borderColor: 'rgba(252,165,165,0.3)',
  },
  controlIcon: {
    fontSize: 20,
    marginBottom: 2,
  },
  controlIconActive: {},
  controlLabel: {
    color: '#94a3b8',
    fontSize: 10,
    fontFamily: MONO,
  },
  controlLabelActive: {
    color: '#fca5a5',
  },
  leaveBtn: {
    backgroundColor: '#7f1d1d',
    paddingHorizontal: 36,
    paddingVertical: 14,
    borderRadius: 99,
    alignItems: 'center',
  },
  leaveBtnText: {
    color: '#fca5a5',
    fontFamily: MONO,
    fontSize: 14,
    fontWeight: '600',
  },
})
