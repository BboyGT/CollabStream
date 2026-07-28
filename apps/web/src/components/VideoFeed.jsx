import { useEffect, useRef, useState } from 'react'

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase()).join('') || '?'
}

// Keeps a dragged tile's position within the current viewport. Without this,
// once dragged even once the tile switches to fixed pixel coordinates
// permanently (see the drag handlers below) — resizing the window smaller,
// or rotating a phone, afterward could leave it stuck off-screen with no
// way back short of a page reload.
function clampPos(x, y, w, h) {
  const maxX = Math.max(0, window.innerWidth - w)
  const maxY = Math.max(0, window.innerHeight - h)
  return { x: Math.min(Math.max(x, 0), maxX), y: Math.min(Math.max(y, 0), maxY) }
}

export default function VideoFeed({ stream, label, name, muted = false, corner = 'br', inline = false, draggable = true }) {
  const videoRef = useRef(null)
  const containerRef = useRef(null)
  const [pos, setPos] = useState(null)
  const [videoOff, setVideoOff] = useState(false)
  const dragging = useRef(false)
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0, w: 0, h: 0 })

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

  // Re-clamp on window resize so a previously-dragged tile can't get
  // stranded outside the viewport when the window shrinks or the device
  // rotates. Only acts once the tile has actually been dragged (pos set) —
  // undragged tiles are positioned by CSS classes and don't need this.
  useEffect(() => {
    function onResize() {
      setPos((p) => {
        if (!p || !containerRef.current) return p
        const rect = containerRef.current.getBoundingClientRect()
        return clampPos(p.x, p.y, rect.width, rect.height)
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  function onMouseDown(e) {
    if (!draggable) return
    dragging.current = true
    const rect = e.currentTarget.getBoundingClientRect()
    dragStart.current = { mx: e.clientX, my: e.clientY, px: rect.left, py: rect.top, w: rect.width, h: rect.height }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  function onTouchStart(e) {
    if (!draggable) return
    const touch = e.touches[0]
    if (!touch) return
    dragging.current = true
    const rect = e.currentTarget.getBoundingClientRect()
    dragStart.current = { mx: touch.clientX, my: touch.clientY, px: rect.left, py: rect.top, w: rect.width, h: rect.height }
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
    setPos(clampPos(dragStart.current.px + dx, dragStart.current.py + dy, dragStart.current.w, dragStart.current.h))
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
    setPos(clampPos(dragStart.current.px + dx, dragStart.current.py + dy, dragStart.current.w, dragStart.current.h))
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
      ref={containerRef}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      style={style}
      className={`${pos ? '' : (inline ? 'relative' : `absolute ${defaultPos}`)} w-32 h-24 sm:w-40 sm:h-28 rounded-xl overflow-hidden border border-slate-700 bg-slate-900 shadow-xl z-50 group touch-none ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
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
