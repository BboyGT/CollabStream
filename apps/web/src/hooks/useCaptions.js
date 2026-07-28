import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export default function useCaptions(onFinalCaption) {
  const recognitionRef = useRef(null)
  const onFinalCaptionRef = useRef(onFinalCaption)
  const [listening, setListening] = useState(false)
  const [interimText, setInterimText] = useState('')
  const [error, setError] = useState('')

  onFinalCaptionRef.current = onFinalCaption

  const SpeechRecognition = useMemo(() => {
    if (typeof window === 'undefined') return null
    return window.SpeechRecognition || window.webkitSpeechRecognition || null
  }, [])

  const supported = Boolean(SpeechRecognition)

  const stop = useCallback(() => {
    const recognition = recognitionRef.current
    recognitionRef.current = null
    if (recognition) {
      recognition.onend = null
      recognition.onerror = null
      recognition.onresult = null
      try { recognition.stop() } catch {}
    }
    setListening(false)
    setInterimText('')
  }, [])

  const start = useCallback(() => {
    if (!SpeechRecognition) {
      setError('Captions work best in Chrome or Edge.')
      return false
    }
    stop()
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = navigator.language || 'en-US'
    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        const text = String(result?.[0]?.transcript || '').trim()
        if (!text) continue
        if (result.isFinal) onFinalCaptionRef.current?.(text)
        else interim = `${interim} ${text}`.trim()
      }
      setInterimText(interim)
    }
    recognition.onerror = (event) => {
      setError(event.error === 'not-allowed'
        ? 'Microphone permission is required for captions.'
        : 'Captions stopped. Try turning them on again.')
      setListening(false)
    }
    recognition.onend = () => {
      setListening(false)
      setInterimText('')
    }
    recognitionRef.current = recognition
    setError('')
    setListening(true)
    recognition.start()
    return true
  }, [SpeechRecognition, stop])

  useEffect(() => () => stop(), [stop])

  return { supported, listening, interimText, error, start, stop }
}
