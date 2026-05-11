import { useState } from 'react'

export default function NetworkBadge({ quality }) {
  const [open, setOpen] = useState(false)
  const { rtt, loss, level, bitrate, connectionType } = quality || {}

  const styles = {
    good:    'bg-emerald-950 text-emerald-200 border-emerald-800',
    fair:    'bg-amber-950 text-amber-200 border-amber-800',
    poor:    'bg-red-950 text-red-200 border-red-800',
    unknown: 'bg-slate-900 text-slate-400 border-slate-800',
  }
  const cls = styles[level] || styles.unknown

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`px-2.5 py-1 rounded-full border text-xs font-mono cursor-pointer hover:opacity-80 transition-opacity ${cls}`}
        aria-label="Toggle network details"
      >
        Net {level}{rtt ? ` · ${rtt}ms` : ''}{loss !== null && loss !== undefined ? ` · ${loss}%` : ''}
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-50 w-52 bg-slate-950/95 border border-slate-800 rounded-xl p-3 shadow-2xl modal-enter">
          <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-2">Connection Details</div>
          <div className="space-y-1.5">
            <Row label="Quality" value={level || '—'} />
            <Row label="RTT" value={rtt != null ? `${rtt} ms` : '—'} />
            <Row label="Packet loss" value={loss != null ? `${loss}%` : '—'} />
            <Row label="Bitrate" value={bitrate != null ? `${bitrate} kbps` : '—'} />
            <Row label="Type" value={connectionType || '—'} />
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-mono text-slate-500">{label}</span>
      <span className="text-[11px] font-mono text-slate-200">{value}</span>
    </div>
  )
}
