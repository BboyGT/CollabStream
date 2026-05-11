import { useEffect, forwardRef } from 'react'
import useSession from '../store/session.js'

const AnnotationCanvas = forwardRef(function AnnotationCanvas(
  { onPointerDown, onPointerMove, onPointerUp, onWheel },
  ref
) {
  const { mode, annotationTool } = useSession()
  const isAnnotating = mode === 'annotate'
  const isControlling = mode === 'control'
  const isLaser = mode === 'laser' || annotationTool === 'laser'

  // Resize canvas buffer to match display size
  useEffect(() => {
    const canvas = ref?.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [ref])

  const cursor = isAnnotating ? 'crosshair' : isControlling ? 'none' : isLaser ? 'crosshair' : 'default'

  return (
    <canvas
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onWheel={onWheel}
      style={{ cursor, pointerEvents: isAnnotating || isControlling || isLaser ? 'all' : 'none' }}
      className="absolute inset-0 w-full h-full"
    />
  )
})

export default AnnotationCanvas
