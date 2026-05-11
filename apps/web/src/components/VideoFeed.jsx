import { useEffect, useRef, useState } from 'react'

function getInitials(name) {
  if (!name) return '??'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase()).join('') || '??'
}

export default function VideoFeed({ stream, label, name, muted = false, corner = 'br', inline = false }) {
  const videoRef = useRef(null)
  const [pos, setPos] = useState(null)
  const [videoOff, setVideoOff] = useState(false)
  const dragging = useRef(false)
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 })

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  useEffect(() => {
    if (!stream) {
      setVideoOff(true)
      return
    }
    const track = stream.getVideoTracks?.()[0]
    if (!track) {
      setVideoOff(true)
      return
    }
    const update = () => {
      const off = track.readyState !== 'live' || track.enabled === false
      setVideoOff(off)
    }
    update()
    track.addEventListener('mute', update)
    track.addEventListener('unmute', update)
    return () => {
      track.removeEventListener('mute', update)
      track.removeEventListener('unmute', update)
    }
  }, [stream])

  function onMouseDown(e) {
    dragging.current = true
    const rect = e.currentTarget.getBoundingClientRect()
    dragStart.current = { mx: e.clientX, my: e.clientY, px: rect.left, py: rect.top }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  function onTouchStart(e) {
    const touch = e.touches[0]
    if (!touch) return
    dragging.current = true
    const rect = e.currentTarget.getBoundingClientRect()
    dragStart.current = { mx: touch.clientX, my: touch.clientY, px: rect.left, py: rect.top }
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd)
  }

  function onTouchMove(e) {
    if (!dragging.current) return
    const touch = e.touches[0]
    if (!touch) return
    e.preventDefault()
    const dx = touch.clientX - dragStart.current.mx
    const dy = touch.clientY - dragStart.current.my
    setPos({ x: dragStart.current.px + dx, y: dragStart.current.py + dy })
  }

  function onTouchEnd() {
    dragging.current = false
    window.removeEventListener('touchmove', onTouchMove)
    window.removeEventListener('touchend', onTouchEnd)
  }

  function onMouseMove(e) {
    if (!dragging.current) return
    const dx = e.clientX - dragStart.current.mx
    const dy = e.clientY - dragStart.current.my
    setPos({ x: dragStart.current.px + dx, y: dragStart.current.py + dy })
  }

  function onMouseUp() {
    dragging.current = false
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  const defaultPos = {
    br: 'bottom-4 right-4',
    bl: 'bottom-4 left-4',
    tr: 'top-4 right-4',
    tl: 'top-4 left-4',
  }[corner] || 'bottom-4 right-4'

  const style = pos
    ? { position: 'fixed', left: pos.x, top: pos.y, zIndex: 50 }
    : {}

  return (
    <div
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      style={style}
      className={`${pos ? '' : (inline ? 'relative' : `absolute ${defaultPos}`)} w-32 h-24 sm:w-40 sm:h-28 rounded-xl overflow-hidden border border-slate-700 bg-slate-900 cursor-grab active:cursor-grabbing shadow-xl z-50 group touch-none`}
    >
      {stream && !videoOff ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1">
          <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200 text-sm font-mono">
            {getInitials(name)}
          </div>
          <span className="text-slate-500 text-xs font-mono">{name || 'Camera off'}</span>
        </div>
      )}
      {label && (
        <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-zinc-300 text-xs font-mono opacity-0 group-hover:opacity-100 transition-opacity">
          {label}
        </div>
      )}
    </div>
  )
}
