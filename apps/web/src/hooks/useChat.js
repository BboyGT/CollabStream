import { useCallback, useRef, useState } from 'react'

const CHUNK_SIZE = 16 * 1024 // 16 KB

// Files larger than this are refused client-side rather than attempted and
// silently failing partway through — see the backpressure note below for
// why large transfers are risky without real flow control.
const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25 MB

// Yield to the event loop every this many chunks. RTCDataChannel.send()
// doesn't block, so a tight loop can queue hundreds of chunks (and, when
// broadcasting from a host to several guests, that many sends *per guest*
// per chunk) faster than the SCTP transport can drain them — a well-known
// WebRTC pitfall that silently drops or corrupts large transfers under
// load. This doesn't replace real bufferedAmount-based flow control (which
// would need the raw RTCDataChannel threaded through from useWebRTC*.js),
// but periodically yielding gives the transport real breathing room and
// meaningfully reduces failure risk for the file sizes this cap allows.
const YIELD_EVERY_N_CHUNKS = 8

function nextTick() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

export default function useChat(sendData, role, displayName) {
  const [messages, setMessages] = useState([])
  // Keyed by a per-transfer id, NOT filename — two people sending files
  // with the same name at the same time used to corrupt both transfers,
  // since they'd share one buffer entry keyed only by `name`.
  const fileBuffers = useRef({}) // transferId -> { chunks, totalChunks, mimeType, size, name, from }

  const send = useCallback((text, target = 'all') => {
    // `target` lets a host send privately to one guest instead of
    // broadcasting — see HostRoom.jsx's chatDispatch. Included on the
    // message itself too, so ChatPanel can show "→ private" on the
    // sender's own copy.
    const msg = { type: 'chat', text, from: displayName || (role === 'host' ? 'Host' : 'Guest'), fromRole: role, ts: Date.now(), target }
    setMessages((m) => [...m, msg])
    sendData?.('annotation', msg, target)
  }, [sendData, role, displayName])

  const sendFile = useCallback(async (file, target = 'all') => {
    if (file.size > MAX_FILE_SIZE) {
      setMessages((m) => [...m, {
        type: 'chat',
        text: `\u26a0 "${file.name}" is too large to send here (${Math.round(file.size / 1024 / 1024)}MB, limit is ${MAX_FILE_SIZE / 1024 / 1024}MB).`,
        from: role, ts: Date.now(),
      }])
      return
    }

    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const totalChunks = Math.ceil(bytes.length / CHUNK_SIZE)
    const transferId = `${Date.now()}-${Math.random().toString(36).slice(2)}`

    sendData?.('annotation', {
      type: 'file-start',
      transferId,
      name: file.name,
      size: file.size,
      mimeType: file.type,
      totalChunks,
      from: displayName || (role === 'host' ? 'Host' : 'Guest'),
      fromRole: role,
    }, target)

    for (let i = 0; i < totalChunks; i++) {
      const slice = bytes.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
      const b64 = btoa(String.fromCharCode(...slice))
      sendData?.('annotation', {
        type: 'file-chunk',
        transferId,
        index: i,
        data: b64,
      }, target)
      if (i > 0 && i % YIELD_EVERY_N_CHUNKS === 0) await nextTick()
    }

    sendData?.('annotation', { type: 'file-end', transferId, from: displayName || (role === 'host' ? 'Host' : 'Guest'), fromRole: role }, target)

    // Add outgoing file to own messages immediately
    const url = URL.createObjectURL(file)
    setMessages((m) => [...m, {
      type: 'file', name: file.name, url, size: file.size, from: displayName || (role === 'host' ? 'Host' : 'Guest'), fromRole: role, ts: Date.now(), target,
    }])
  }, [sendData, role, displayName])

  const handle = useCallback((msg) => {
    if (msg.type === 'chat') {
      setMessages((m) => [...m, msg])
      return
    }

    if (msg.type === 'file-start') {
      fileBuffers.current[msg.transferId] = {
        chunks: new Array(msg.totalChunks),
        totalChunks: msg.totalChunks,
        mimeType: msg.mimeType,
        size: msg.size,
        name: msg.name,
        from: msg.from,
        fromRole: msg.fromRole,
      }
      return
    }

    if (msg.type === 'file-chunk') {
      const buf = fileBuffers.current[msg.transferId]
      if (!buf) return
      buf.chunks[msg.index] = msg.data
      return
    }

    if (msg.type === 'file-end') {
      const buf = fileBuffers.current[msg.transferId]
      if (!buf) return
      delete fileBuffers.current[msg.transferId]

      // Don't silently reconstruct a corrupt file. A missing chunk (e.g.
      // dropped under load — see the backpressure note above) leaves a
      // `undefined` entry, and atob(undefined) doesn't throw — the string
      // "undefined" happens to be valid base64 — so without this check the
      // recipient would get a file that looks received but is silently
      // garbled at the missing chunk, discovered only when they try to
      // open it.
      const missing = buf.chunks.some((c) => c === undefined)
      if (missing) {
        console.warn(`File reassembly failed: "${buf.name}" is missing one or more chunks`)
        setMessages((m) => [...m, {
          type: 'chat',
          text: `\u26a0 "${buf.name}" failed to transfer completely and was discarded.`,
          from: buf.from, fromRole: buf.fromRole, ts: Date.now(),
        }])
        return
      }

      try {
        const binary = buf.chunks.map((b64) => {
          const raw = atob(b64)
          return new Uint8Array(raw.length).map((_, i) => raw.charCodeAt(i))
        })
        const blob = new Blob(binary, { type: buf.mimeType || 'application/octet-stream' })
        const url = URL.createObjectURL(blob)
        setMessages((m) => [...m, {
          type: 'file', name: buf.name, url, size: buf.size, from: buf.from, fromRole: buf.fromRole, ts: Date.now(),
        }])
      } catch (e) {
        console.warn('File reassembly failed', e)
        setMessages((m) => [...m, {
          type: 'chat',
          text: `\u26a0 "${buf.name}" failed to transfer completely and was discarded.`,
          from: buf.from, fromRole: buf.fromRole, ts: Date.now(),
        }])
      }
    }
  }, [])

  return { messages, send, sendFile, handle }
}
