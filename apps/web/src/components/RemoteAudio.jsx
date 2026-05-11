import { useEffect, useRef } from 'react'

export default function RemoteAudio({ stream }) {
  const audioRef = useRef(null)

  useEffect(() => {
    if (audioRef.current && stream) {
      audioRef.current.srcObject = stream
    }
  }, [stream])

  if (!stream) return null

  return <audio ref={audioRef} autoPlay playsInline />
}
