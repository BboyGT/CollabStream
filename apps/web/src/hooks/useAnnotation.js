import { useCallback, useRef, useEffect } from 'react'
import useSession from '../store/session.js'

export default function useAnnotation(canvasRef, pointerRef, sendData, role) {
  const { annotationColor, annotationSize, annotationTool, mode } = useSession()
  const drawing = useRef(false)
  const colorRef = useRef(annotationColor)
  const sizeRef = useRef(annotationSize)
  const toolRef = useRef(annotationTool)
  const modeRef = useRef(mode)
  const strokesRef = useRef([])
  const previewRef = useRef(null)

  useEffect(() => { colorRef.current = annotationColor }, [annotationColor])
  useEffect(() => { sizeRef.current = annotationSize }, [annotationSize])
  useEffect(() => { toolRef.current = annotationTool }, [annotationTool])
  useEffect(() => { modeRef.current = mode }, [mode])

  function normalize(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect()
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    }
  }

  function drawStroke(ctx, stroke) {
    const { tool, color, size, points } = stroke
    if (!points?.length) return

    // ── Eraser: composite-out so it works on white or transparent backgrounds ──
    if (tool === 'eraser') {
      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.lineWidth = size * 6
      ctx.strokeStyle = 'rgba(0,0,0,1)'
      ctx.globalAlpha = 1
      ctx.beginPath()
      points.forEach((p, i) => {
        const px = p.x * ctx.canvas.width
        const py = p.y * ctx.canvas.height
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.stroke()
      ctx.restore()
      return
    }

    if (tool === 'rect') {
      const a = points[0]
      const b = points[points.length - 1]
      const x = a.x * ctx.canvas.width
      const y = a.y * ctx.canvas.height
      const w = (b.x - a.x) * ctx.canvas.width
      const h = (b.y - a.y) * ctx.canvas.height
      ctx.strokeStyle = color
      ctx.lineWidth = size * 2
      ctx.strokeRect(x, y, w, h)
      return
    }

    if (tool === 'arrow') {
      const a = points[0]
      const b = points[points.length - 1]
      const x1 = a.x * ctx.canvas.width
      const y1 = a.y * ctx.canvas.height
      const x2 = b.x * ctx.canvas.width
      const y2 = b.y * ctx.canvas.height
      const headLen = 10 + size * 2
      const angle = Math.atan2(y2 - y1, x2 - x1)
      ctx.strokeStyle = color
      ctx.lineWidth = size * 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x2, y2)
      ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6))
      ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6))
      ctx.lineTo(x2, y2)
      ctx.fillStyle = color
      ctx.fill()
      return
    }

    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = tool === 'highlight' ? size * 6 : size * 2
    ctx.strokeStyle = color
    ctx.globalAlpha = tool === 'highlight' ? 0.25 : 1
    ctx.beginPath()
    points.forEach((p, i) => {
      const px = p.x * ctx.canvas.width
      const py = p.y * ctx.canvas.height
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  function renderAll() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    strokesRef.current.forEach((s) => drawStroke(ctx, s))
    if (previewRef.current) drawStroke(ctx, previewRef.current)
  }

  function drawLaserPoint(x, y) {
    const canvas = pointerRef?.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const px = x * canvas.width
    const py = y * canvas.height
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.beginPath()
    ctx.arc(px, py, 6, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(245, 158, 11, 0.9)'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(px, py, 14, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)'
    ctx.lineWidth = 2
    ctx.stroke()
    setTimeout(() => {
      const c = pointerRef?.current
      if (!c) return
      c.getContext('2d').clearRect(0, 0, c.width, c.height)
    }, 120)
  }

  const onPointerDown = useCallback((e) => {
    const tool = modeRef.current === 'laser' ? 'laser' : toolRef.current
    if (modeRef.current !== 'annotate' && modeRef.current !== 'laser') return
    if (tool === 'laser' || tool === 'text') return
    drawing.current = true
    const canvas = canvasRef.current
    const { x, y } = normalize(canvas, e.clientX, e.clientY)
    const stroke = { by: role, tool, color: colorRef.current, size: sizeRef.current, points: [{ x, y }] }
    previewRef.current = stroke
    if (tool === 'pen' || tool === 'highlight' || tool === 'eraser') {
      strokesRef.current.push(stroke)
      renderAll()
      sendData('annotation', { type: 'stroke', action: 'start', stroke })
    } else {
      renderAll()
    }
  }, [canvasRef, sendData, role])

  const onPointerMove = useCallback((e) => {
    const tool = modeRef.current === 'laser' ? 'laser' : toolRef.current
    if (tool === 'laser') {
      const canvas = canvasRef.current
      const { x, y } = normalize(canvas, e.clientX, e.clientY)
      drawLaserPoint(x, y)
      sendData('annotation', { type: 'laser', x, y })
      return
    }
    if (!drawing.current || modeRef.current !== 'annotate') return
    const canvas = canvasRef.current
    const { x, y } = normalize(canvas, e.clientX, e.clientY)
    if (tool === 'pen' || tool === 'highlight' || tool === 'eraser') {
      const current = strokesRef.current[strokesRef.current.length - 1]
      if (current) current.points.push({ x, y })
      renderAll()
      sendData('annotation', { type: 'stroke', action: 'move', x, y, by: role })
    } else if (previewRef.current) {
      previewRef.current.points[1] = { x, y }
      renderAll()
    }
  }, [canvasRef, sendData, role])

  const onPointerUp = useCallback((e) => {
    const tool = modeRef.current === 'laser' ? 'laser' : toolRef.current
    if (!drawing.current || modeRef.current !== 'annotate') return
    drawing.current = false
    const canvas = canvasRef.current
    const { x, y } = normalize(canvas, e.clientX, e.clientY)
    if (tool === 'pen' || tool === 'highlight' || tool === 'eraser') {
      const current = strokesRef.current[strokesRef.current.length - 1]
      if (current) current.points.push({ x, y })
      renderAll()
      sendData('annotation', { type: 'stroke', action: 'end', x, y, by: role })
    } else if (previewRef.current) {
      previewRef.current.points[1] = { x, y }
      strokesRef.current.push(previewRef.current)
      renderAll()
      sendData('annotation', { type: 'stroke', action: 'commit', stroke: previewRef.current })
      previewRef.current = null
    }
  }, [canvasRef, sendData, role])

  const handleRemoteDraw = useCallback((msg) => {
    if (msg.type === 'laser') {
      drawLaserPoint(msg.x, msg.y)
    }
    if (msg.type === 'stroke' && msg.stroke) {
      strokesRef.current.push(msg.stroke)
      renderAll()
    }
    if (msg.type === 'stroke' && msg.action && msg.by) {
      const last = strokesRef.current[strokesRef.current.length - 1]
      if (!last || last.by !== msg.by) return
      if (msg.action === 'move' || msg.action === 'end') {
        last.points.push({ x: msg.x, y: msg.y })
        renderAll()
      }
    }
    if (msg.type === 'undo') {
      const idx = [...strokesRef.current].reverse().findIndex((s) => s.by === msg.by)
      if (idx >= 0) {
        const real = strokesRef.current.length - 1 - idx
        strokesRef.current.splice(real, 1)
        renderAll()
      }
    }
    if (msg.type === 'clear') {
      clearCanvas()
    }
  }, [canvasRef])

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    strokesRef.current = []
    sendData?.('annotation', { type: 'clear' })
  }, [canvasRef, sendData])

  const clearCanvasLocal = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    strokesRef.current = []
  }, [canvasRef])

  const undo = useCallback(() => {
    const idx = [...strokesRef.current].reverse().findIndex((s) => s.by === role)
    if (idx < 0) return
    const real = strokesRef.current.length - 1 - idx
    strokesRef.current.splice(real, 1)
    renderAll()
    sendData?.('annotation', { type: 'undo', by: role })
  }, [sendData, role])

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    handleRemoteDraw,
    clearCanvas,
    clearCanvasLocal,
    undo,
  }
}
