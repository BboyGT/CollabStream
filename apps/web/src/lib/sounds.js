/**
 * sounds.js — pure AudioContext synthesis, no audio files.
 * All sounds are gated: only play when document.visibilityState === 'visible'.
 */

function gate() {
  return document.visibilityState === 'visible'
}

function ctx() {
  return new (window.AudioContext || window.webkitAudioContext)()
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
