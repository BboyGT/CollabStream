import { useState } from 'react'
import useSession from '../store/session.js'
import Baton from './Baton.jsx'

export default function ControlBar({ onGrant, onRevoke, forceDisabled = false, disabledReason, controlHolderName }) {
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

  // Rendered through the shared Baton component (see Baton.jsx) instead of
  // a bespoke red pulsing button — same amber pill language as the floor-
  // mode banner and participants list, just holding="control" instead of
  // "floor". Clicking it takes control back; this replaces what used to be
  // a completely separately-styled "Take Back Control" button.
  if (controlGranted) {
    return <Baton holderName={controlHolderName} isMe={false} holding="control" onClick={handleRevoke} pulse />
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2 animate-rise">
        <span className="text-xs text-ink-lo font-mono">Give {controlHolderName || 'guest'} full control?</span>
        <button
          onClick={handleConfirm}
          className="px-3 py-1.5 rounded-lg bg-coral hover:brightness-110 text-white text-xs font-mono font-medium transition-all"
        >
          Yes, hand control
        </button>
        <button
          onClick={handleCancel}
          className="px-3 py-1.5 rounded-lg bg-ink-700 hover:bg-ink-650 border border-line text-ink-hi text-xs font-mono transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  // Pre-handoff state: nobody holds control yet, so this is an action
  // trigger (arm control mode / hand it to whoever requested it), not a
  // status display — same amber pill language as BatonActionButton, using
  // the same arrow glyph as Baton itself for visual consistency across the
  // whole family.
  return (
    <button
      onClick={handleHandControl}
      disabled={!canGrant}
      title={reason}
      className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-mono font-medium border transition-all duration-200 ${
        canGrant
          ? 'bg-amber-dim border-amber/35 text-amber hover:bg-amber/20'
          : 'bg-ink-700 border-line text-ink-dim cursor-not-allowed'
      }`}
    >
      Hand off control
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12h13M13 6l6 6-6 6" />
      </svg>
    </button>
  )
}
