import { useCallback } from 'react'
import useSession from '../store/session.js'

export default function useAudio(sendData) {
  const { localStream, audioMuted, setAudioMuted, setRemoteAudioMuted } = useSession()

  const toggleMute = useCallback(() => {
    if (!localStream) return
    const audioTrack = localStream.getAudioTracks()[0]
    if (!audioTrack) return
    audioTrack.enabled = !audioTrack.enabled
    const muted = !audioTrack.enabled
    setAudioMuted(muted)
    sendData?.('annotation', { type: muted ? 'peer-muted' : 'peer-unmuted' })
  }, [localStream, setAudioMuted, sendData])

  const handleAudioEvent = useCallback((msg) => {
    if (msg.type === 'peer-muted') setRemoteAudioMuted(true)
    if (msg.type === 'peer-unmuted') setRemoteAudioMuted(false)
  }, [setRemoteAudioMuted])

  return { toggleMute, handleAudioEvent, audioMuted }
}
