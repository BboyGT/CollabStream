/**
 * sounds.js — pure AudioContext synthesis, no audio files.
 * All sounds are gated: only play when document.visibilityState === 'visible'.
 *
 * Uses one shared, lazily-created AudioContext for the whole page lifetime
 * instead of a fresh one per call. Every play*() function used to call
 * `new AudioContext()` and never close it — over a long session with many
 * join/leave/chat events, that's a genuine resource leak: browsers cap the
 * number of simultaneously live AudioContexts (Chrome allows only a
 * handful), and once that cap is hit, `new AudioContext()` throws — which
 * was silently swallowed by each function's try/catch, so sound effects
 * would just go silent for the rest of the session with no visible error.
 */

function gate() {
  return document.visibilityState === 'visible'
}

let sharedCtx = null
function ctx() {
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  // Browsers suspend a context that was created (or left idle) outside a
  // user gesture; resume is a no-op if already running.
  if (sharedCtx.state === 'suspended') sharedCtx.resume().catch(() => {})
  return sharedCtx
}

function tone(audioCtx, freq, type, startTime, duration, gain) {
  const osc = audioCtx.createOscillator()
  const g = audioCtx.createGain()
  osc.connect(g)
  g.connect(audioCtx.destination)
  osc.type = type
  osc.frequency.value = freq
  g.gain.setValueAtTime(gain, startTime)
  g.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
  osc.start(startTime)
  osc.stop(startTime + duration + 0.01)
}

export function playGuestJoin() {
  if (!gate()) return
  try {
    const c = ctx()
    // Soft ascending chime: 440 Hz then 660 Hz, 80ms each, sine wave
    tone(c, 440, 'sine', c.currentTime, 0.20, 0.12)
    tone(c, 660, 'sine', c.currentTime + 0.09, 0.20, 0.12)
  } catch {}
}

export function playGuestLeave() {
  if (!gate()) return
  try {
    const c = ctx()
    // Descending fade: 440 → 330 Hz, gentle, ~0.3s
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.connect(g)
    g.connect(c.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(440, c.currentTime)
    osc.frequency.linearRampToValueAtTime(330, c.currentTime + 0.30)
    g.gain.setValueAtTime(0.10, c.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.30)
    osc.start(c.currentTime)
    osc.stop(c.currentTime + 0.32)
  } catch {}
}

export function playChatMessage() {
  if (!gate()) return
  try {
    const c = ctx()
    // Single tick: 880 Hz, 0.05s, triangle wave, very quiet
    tone(c, 880, 'triangle', c.currentTime, 0.05, 0.08)
  } catch {}
}

export function playControlGranted() {
  if (!gate()) return
  try {
    const c = ctx()
    // Ascending ding: 523 → 659 → 784 Hz, 60ms each
    tone(c, 523, 'sine', c.currentTime, 0.12, 0.13)
    tone(c, 659, 'sine', c.currentTime + 0.06, 0.12, 0.13)
    tone(c, 784, 'sine', c.currentTime + 0.12, 0.16, 0.13)
  } catch {}
}
