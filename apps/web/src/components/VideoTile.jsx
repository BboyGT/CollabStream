import { useEffect, useRef, useState } from 'react'

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase()).join('') || '?'
}

const pipSupported = typeof document !== 'undefined' && !!document.pictureInPictureEnabled

export default function VideoTile({ stream, name, muted = false, label, micMuted = false }) {
  const videoRef = useRef(null)
  const [videoOff, setVideoOff] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [pip, setPip] = useState(false)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
      setLoaded(false)
    }
  }, [stream])

  useEffect(() => {
    if (!stream) { setVideoOff(true); setLoaded(false); return }
    const track = stream.getVideoTracks?.()[0]
    if (!track) { setVideoOff(true); return }
    const update = () => setVideoOff(track.readyState !== 'live' || track.enabled === false)
    update()
    track.addEventListener('mute', update)
    track.addEventListener('unmute', update)
    return () => { track.removeEventListener('mute', update); track.removeEventListener('unmute', update) }
  }, [stream])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    function onEnter() { setPip(true) }
    function onLeave() { setPip(false) }
    video.addEventListener('enterpictureinpicture', onEnter)
    video.addEventListener('leavepictureinpicture', onLeave)
    return () => {
      video.removeEventListener('enterpictureinpicture', onEnter)
      video.removeEventListener('leavepictureinpicture', onLeave)
    }
  }, [])

  async function enterPip() {
    const video = videoRef.current
    if (!video) return
    try { await video.requestPictureInPicture() } catch (e) { console.warn('PiP failed', e) }
  }

  const showSkeleton = !videoOff && stream && !loaded

  return (
    <div className="relative w-full h-full bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
      {showSkeleton && <div className="absolute inset-0 skeleton rounded-xl" />}

      {!videoOff && stream ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={muted}
            onCanPlay={() => setLoaded(true)}
            className="w-full h-full object-cover"
            style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.2s' }}
          />
          {pip && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80">
              <p className="text-slate-300 text-xs font-mono">Viewing in PiP</p>
            </div>
          )}
        </>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2">
          {!stream ? (
            <div className="skeleton w-14 h-14 rounded-full" />
          ) : (
            <>
              <div className="w-14 h-14 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-200 font-mono text-lg">
                {getInitials(name)}
              </div>
              <div className="text-slate-400 text-xs font-mono">{name || 'Camera off'}</div>
            </>
          )}
        </div>
      )}

      {/* Polished label pill (Design 6) */}
      {(label || name) && loaded && (
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-sm">
          {micMuted ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
              <line x1="12" y1="19" x2="12" y2="23" />
            </svg>
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          )}
          <span className="text-zinc-200 text-[10px] font-mono">{label || name}</span>
        </div>
      )}

      {/* PiP button (Feature 1) */}
      {pipSupported && stream && loaded && !videoOff && (
        <button
          onClick={enterPip}
          title="Picture in Picture"
          className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full bg-black/40 backdrop-blur-sm text-[10px] font-mono text-zinc-300 hover:text-white hover:bg-black/60 transition-colors opacity-0 group-hover:opacity-100"
          style={{ opacity: 0.65 }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.65')}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <rect x="12" y="10" width="9" height="6" rx="1" fill="currentColor" />
          </svg>
          PiP
        </button>
      )}
    </div>
  )
}
