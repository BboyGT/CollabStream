import { useCallback, useRef, useState } from 'react'

const CHUNK_SIZE = 16 * 1024 // 16 KB

export default function useChat(sendData, role) {
  const [messages, setMessages] = useState([])
  const fileBuffers = useRef({}) // name -> { chunks, totalChunks, mimeType, size }

  const send = useCallback((text) => {
    const msg = { type: 'chat', text, from: role, ts: Date.now() }
    setMessages((m) => [...m, msg])
    sendData?.('annotation', msg)
  }, [sendData, role])

  const sendFile = useCallback(async (file) => {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const totalChunks = Math.ceil(bytes.length / CHUNK_SIZE)

    sendData?.('annotation', {
      type: 'file-start',
      name: file.name,
      size: file.size,
      mimeType: file.type,
      totalChunks,
      from: role,
    })

    for (let i = 0; i < totalChunks; i++) {
      const slice = bytes.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
      const b64 = btoa(String.fromCharCode(...slice))
      sendData?.('annotation', {
        type: 'file-chunk',
        name: file.name,
        index: i,
        data: b64,
      })
    }

    sendData?.('annotation', { type: 'file-end', name: file.name, from: role })

    // Add outgoing file to own messages immediately
    const url = URL.createObjectURL(file)
    setMessages((m) => [...m, {
      type: 'file', name: file.name, url, size: file.size, from: role, ts: Date.now(),
    }])
  }, [sendData, role])

  const handle = useCallback((msg) => {
    if (msg.type === 'chat') {
      setMessages((m) => [...m, msg])
      return
    }

    if (msg.type === 'file-start') {
      fileBuffers.current[msg.name] = {
        chunks: new Array(msg.totalChunks),
        totalChunks: msg.totalChunks,
        mimeType: msg.mimeType,
        size: msg.size,
        from: msg.from,
      }
      return
    }

    if (msg.type === 'file-chunk') {
      const buf = fileBuffers.current[msg.name]
      if (!buf) return
      buf.chunks[msg.index] = msg.data
      return
    }

    if (msg.type === 'file-end') {
      const buf = fileBuffers.current[msg.name]
      if (!buf) return
      try {
        const binary = buf.chunks.map((b64) => {
          const raw = atob(b64)
          return new Uint8Array(raw.length).map((_, i) => raw.charCodeAt(i))
        })
        const blob = new Blob(binary, { type: buf.mimeType || 'application/octet-stream' })
        const url = URL.createObjectURL(blob)
        setMessages((m) => [...m, {
          type: 'file', name: msg.name, url, size: buf.size, from: buf.from, ts: Date.now(),
        }])
      } catch (e) {
        console.warn('File reassembly failed', e)
      }
      delete fileBuffers.current[msg.name]
    }
  }, [])

  return { messages, send, sendFile, handle }
}
