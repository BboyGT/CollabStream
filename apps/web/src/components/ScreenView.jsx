import { useEffect, useRef } from 'react'
import AnnotationCanvas from './AnnotationCanvas.jsx'
import useSession from '../store/session.js'

export default function ScreenView({
  stream,
  canvasRef,
  pointerRef,
  videoRef: externalVideoRef,
  annotationHandlers,
  muted = true,
  fit = 'contain',
}) {
  const internalVideoRef = useRef(null)
  const videoRef = externalVideoRef || internalVideoRef
  const { mode, controlGranted } = useSession()

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream, videoRef])

  useEffect(() => {
    const canvas = pointerRef?.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [pointerRef])

  const isControl = mode === 'control'

  const fitClass = fit === 'cover' ? 'object-cover' : 'object-contain'

  return (
    <div
      className={`relative w-full h-full bg-slate-950 rounded-xl overflow-hidden transition-all duration-300 ${
        isControl ? 'ring-2 ring-red-500' : ''
      }`}
    >
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className={`w-full h-full ${fitClass}`}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-full border-2 border-slate-700 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#52525b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
          </div>
          <p className="text-slate-500 text-sm font-mono">
            {mode === 'view' ? 'Waiting for host to share screen…' : 'No screen share'}
          </p>
        </div>
      )}

      {/* Annotation + control canvas layer */}
      <AnnotationCanvas
        ref={canvasRef}
        {...annotationHandlers}
      />

      {/* Laser / pointer layer */}
      <canvas
        ref={pointerRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* Control mode overlay indicator */}
      {isControl && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 glass rounded-full border border-red-800 text-red-300 text-xs font-mono animate-fade-in">
          You are controlling the host — press Esc to stop
        </div>
      )}
    </div>
  )
}
