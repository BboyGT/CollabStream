import { useCallback, useEffect, useRef } from 'react'
import useSession from '../store/session.js'

export default function useControl(videoRef, sendData) {
  const { mode, remoteMeta, controlToken } = useSession()
  const modeRef = useRef(mode)
  const metaRef = useRef(remoteMeta)
  const tokenRef = useRef(controlToken)

  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { metaRef.current = remoteMeta }, [remoteMeta])
  useEffect(() => { tokenRef.current = controlToken }, [controlToken])

  // Scale pointer coords from video element space to host screen space
  function scaleCoords(clientX, clientY) {
    const video = videoRef?.current
    const meta = metaRef.current
    if (!video || !meta) return null
    const rect = video.getBoundingClientRect()
    const x = Math.round(((clientX - rect.left) / rect.width) * meta.screenWidth)
    const y = Math.round(((clientY - rect.top) / rect.height) * meta.screenHeight)
    return { x, y }
  }

  function send(evt) {
    sendData?.('control', evt)
  }

  const onMouseMove = useCallback((e) => {
    if (modeRef.current !== 'control') return
    const coords = scaleCoords(e.clientX, e.clientY)
    if (!coords) return
    send({ type: 'input', event: 'mousemove', ...coords })
  }, [sendData])

  const onMouseDown = useCallback((e) => {
    if (modeRef.current !== 'control') return
    e.preventDefault()
    const coords = scaleCoords(e.clientX, e.clientY)
    if (!coords) return
    send({ type: 'input', event: 'mousedown', ...coords, button: e.button })
  }, [sendData])

  const onMouseUp = useCallback((e) => {
    if (modeRef.current !== 'control') return
    const coords = scaleCoords(e.clientX, e.clientY)
    if (!coords) return
    send({ type: 'input', event: 'mouseup', ...coords, button: e.button })
  }, [sendData])

  const onWheel = useCallback((e) => {
    if (modeRef.current !== 'control') return
    e.preventDefault()
    send({ type: 'input', event: 'scroll', dx: e.deltaX, dy: e.deltaY })
  }, [sendData])

  const onKeyDown = useCallback((e) => {
    if (modeRef.current !== 'control') return
    e.preventDefault()
    send({ type: 'input', event: 'keydown', key: e.key, code: e.code })
  }, [sendData])

  const onKeyUp = useCallback((e) => {
    if (modeRef.current !== 'control') return
    send({ type: 'input', event: 'keyup', key: e.key, code: e.code })
  }, [sendData])

  // Attach global key listeners when in control mode
  useEffect(() => {
    if (mode !== 'control') return
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [mode, onKeyDown, onKeyUp])

  return { onMouseMove, onMouseDown, onMouseUp, onWheel }
}
