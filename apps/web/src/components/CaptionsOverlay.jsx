export default function CaptionsOverlay({ captions = [], interimText = '', enabled = false }) {
  const visible = enabled && (captions.length > 0 || interimText)
  if (!visible) return null
  const recent = captions.slice(-2)
  return (
    <div className="pointer-events-none absolute left-1/2 bottom-24 z-40 w-[min(720px,calc(100%-2rem))] -translate-x-1/2 space-y-1">
      {recent.map((caption) => (
        <div key={caption.id} className="rounded-lg border border-slate-700 bg-black/75 px-3 py-2 shadow-xl">
          <div className="mb-0.5 font-mono text-[10px] uppercase tracking-widest text-cyan-300">{caption.from}</div>
          <div className="text-sm leading-snug text-slate-50">{caption.text}</div>
        </div>
      ))}
      {interimText && (
        <div className="rounded-lg border border-slate-800 bg-black/55 px-3 py-2 text-sm italic leading-snug text-slate-300">
          {interimText}
        </div>
      )}
    </div>
  )
}
