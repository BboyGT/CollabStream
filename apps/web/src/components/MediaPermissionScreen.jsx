export default function MediaPermissionScreen({ title, body, error, onRetry }) {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-6 text-center safe-area">
      <div className="max-w-md w-full bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
        <h2 className="text-zinc-100 text-lg font-sans font-semibold mb-2">{title}</h2>
        <p className="text-zinc-400 text-sm leading-relaxed mb-4">{body}</p>
        {error && (
          <p className="text-red-400 text-xs font-mono mb-4">
            {error}
          </p>
        )}
        <button
          onClick={onRetry}
          className="w-full px-4 py-3 rounded-xl bg-violet-600 text-white text-sm font-mono font-medium hover:bg-violet-500 transition-colors"
        >
          Try again
        </button>
        <p className="text-zinc-600 text-[11px] font-mono mt-3">
          We only use camera & mic during the call.
        </p>
      </div>
    </div>
  )
}
