import useSession from '../store/session.js'

function MicIcon({ muted }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {muted ? (
        <>
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
          <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </>
      ) : (
        <>
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </>
      )}
    </svg>
  )
}

export default function AudioControls({ onToggleMute }) {
  const { audioMuted, remoteAudioMuted } = useSession()

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onToggleMute}
        title={audioMuted ? 'Unmute mic' : 'Mute mic'}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-mono transition-all duration-200 ${
          audioMuted
            ? 'bg-red-950 border-red-800 text-red-300 hover:bg-red-900'
            : 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
        }`}
      >
        <MicIcon muted={audioMuted} />
        <span className="text-xs">{audioMuted ? 'Muted' : 'Live'}</span>
      </button>

      {remoteAudioMuted && (
        <span className="px-2 py-1 rounded bg-slate-900 text-slate-400 text-xs font-mono">
          Peer muted
        </span>
      )}
    </div>
  )
}
