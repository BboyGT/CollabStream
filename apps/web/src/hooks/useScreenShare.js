import { useCallback, useRef } from 'react'
import useSession from '../store/session.js'

export const SHARE_QUALITIES = [
  { label: 'Auto', width: undefined, height: undefined, frameRate: undefined },
  { label: 'HD', width: 1920, height: 1080, frameRate: 30 },
  { label: 'Balanced', width: 1280, height: 720, frameRate: 15 },
  { label: 'Low', width: 854, height: 480, frameRate: 5 },
]

export default function useScreenShare(addScreenTrack) {
  const { setScreenStream } = useSession()
  const streamRef = useRef(null)

  const startShare = useCallback(async (quality = SHARE_QUALITIES[0]) => {
    const videoConstraints = { cursor: 'always' }
    if (quality.width) videoConstraints.width = { ideal: quality.width }
    if (quality.height) videoConstraints.height = { ideal: quality.height }
    if (quality.frameRate) videoConstraints.frameRate = { ideal: quality.frameRate }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: videoConstraints,
        audio: false,
      })
      streamRef.current = stream
      setScreenStream(stream)
      addScreenTrack?.(stream)

      stream.getVideoTracks()[0].onended = () => {
        stopShare()
      }

      return stream
    } catch (err) {
      console.error('Screen share failed:', err)
      return null
    }
  }, [setScreenStream, addScreenTrack])

  const stopShare = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    setScreenStream(null)
    streamRef.current = null
  }, [setScreenStream])

  return { startShare, stopShare }
}
