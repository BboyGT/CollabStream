import { useState } from 'react'
import useSession from '../store/session.js'

export default function ControlBar({ onGrant, onRevoke, forceDisabled = false, disabledReason }) {
  const { controlGranted, companionConnected, peerConnected } = useSession()
  const [confirming, setConfirming] = useState(false)

  const canGrant = companionConnected && peerConnected && !controlGranted && !forceDisabled
  const reason =
    disabledReason ||
    (!companionConnected ? 'Desktop companion required' : !peerConnected ? 'Waiting for guest' : 'Hand control to guest')

  function handleHandControl() {
    setConfirming(true)
  }

  function handleConfirm() {
    setConfirming(false)
    onGrant?.()
  }

  function handleCancel() {
    setConfirming(false)
  }

  function handleRevoke() {
    onRevoke?.()
  }

  if (controlGranted) {
    return (
      <button
        onClick={handleRevoke}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-400 text-slate-950 text-sm font-mono font-medium transition-all duration-200 animate-pulse-ring"
      >
        <span className="w-2 h-2 rounded-full bg-red-200" />
        Take Back Control
      </button>
    )
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2 animate-slide-up">
        <span className="text-xs text-slate-400 font-mono">Give Guest full control?</span>
        <button
          onClick={handleConfirm}
          className="px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-400 text-slate-950 text-xs font-mono font-medium transition-colors"
        >
          Yes, hand control
        </button>
        <button
          onClick={handleCancel}
          className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-mono transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={handleHandControl}
      disabled={!canGrant}
      title={reason}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-mono font-medium border transition-all duration-200 ${
        canGrant
          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 hover:bg-cyan-500/30 hover:text-cyan-100'
          : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
      }`}
    >
      Hand Control
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14M12 5l7 7-7 7" />
      </svg>
    </button>
  )
}
