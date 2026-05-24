import { useEffect, useMemo, useState } from 'react'
import { buildIcs } from '../lib/ics.js'

function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function toGoogleCalendarUrl({ title, description, start, durationMinutes }) {
  function toISO(date) {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  }
  const end = new Date(start.getTime() + (durationMinutes || 30) * 60000)
  const params = new URLSearchParams({
    text: title || 'CollabStream session',
    dates: `${toISO(start)}/${toISO(end)}`,
    details: description || '',
    location: 'CollabStream',
  })
  return `https://calendar.google.com/calendar/r/eventedit?${params.toString()}`
}

export default function ScheduleModal({ open, onClose, joinUrl, joinCode }) {
  const [title, setTitle] = useState('CollabStream session')
  const [notes, setNotes] = useState('')
  const [when, setWhen] = useState(toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000)))
  const [durationHours, setDurationHours] = useState(0)
  const [durationMins, setDurationMins] = useState(30)
  const safeJoinUrl = typeof joinUrl === 'string' ? joinUrl : ''
  const safeJoinCode = typeof joinCode === 'string' ? joinCode : ''

  useEffect(() => {
    if (!open) return
    setTitle('CollabStream session')
    setNotes('')
  }, [open])

  const startDate = useMemo(() => new Date(when), [when])
  const totalMinutes = durationHours * 60 + durationMins

  // Auto-include join code and link in description
  const fullDescription = [
    notes,
    safeJoinCode ? `Join code: ${safeJoinCode}` : '',
    safeJoinUrl ? `Link: ${safeJoinUrl}` : '',
  ].filter(Boolean).join('\n')

  function handleSave() {
    const ics = buildIcs({
      title,
      description: fullDescription,
      start: startDate,
      durationMinutes: totalMinutes || 30,
      url: safeJoinUrl,
    })
    const blob = new Blob([ics], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'collabstream-invite.ics'
    a.click()
    URL.revokeObjectURL(url)
    navigator.clipboard.writeText(fullDescription).catch(() => {})
    onClose?.()
  }

  function handleGoogleCalendar() {
    const url = toGoogleCalendarUrl({
      title,
      description: fullDescription,
      start: startDate,
      durationMinutes: totalMinutes || 30,
    })
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-zinc-950 p-4 shadow-xl modal-enter">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-mono text-slate-100">Schedule a call</h3>
          <button onClick={onClose} className="text-xs font-mono text-slate-500 hover:text-slate-200">Close</button>
        </div>
        <div className="space-y-3">
          <div>
            <div className="text-xs text-slate-400 mb-1">Title</div>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-600" />
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Date &amp; time</div>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-600" />
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Duration</div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-slate-500 font-mono">Hours</label>
                <select value={durationHours} onChange={(e) => setDurationHours(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-200 outline-none font-mono">
                  {Array.from({ length: 9 }, (_, i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-slate-500 font-mono">Minutes</label>
                <select value={durationMins} onChange={(e) => setDurationMins(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-200 outline-none font-mono">
                  {[0, 15, 30, 45].map((m) => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
                </select>
              </div>
              <span className="text-xs text-slate-500 font-mono">
                {durationHours > 0 ? `${durationHours}h ` : ''}{durationMins}m
                {totalMinutes === 0 && <span className="text-amber-400 ml-1">(min 15m)</span>}
              </span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Notes</div>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 h-16 outline-none focus:border-cyan-600" />
          </div>
          {(safeJoinCode || safeJoinUrl) && (
            <div className="text-[10px] text-slate-500 font-mono bg-slate-900/60 rounded-lg px-3 py-2">
              {safeJoinCode && <div>Join code: <span className="text-slate-300">{safeJoinCode}</span></div>}
              {safeJoinUrl && <div className="mt-0.5 break-all">Link: <span className="text-slate-300">{safeJoinUrl}</span></div>}
              <div className="text-slate-600 mt-0.5">These will be included in the invite.</div>
            </div>
          )}
          <div className="text-[11px] text-slate-500">
            An invite file (.ics) will download and the invite text will be copied to clipboard.
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2 pt-1">
            <button onClick={handleSave} disabled={totalMinutes === 0}
              className="w-full px-3 py-2.5 rounded-lg bg-cyan-500/20 border border-cyan-400 text-cyan-200 text-xs font-mono disabled:opacity-40 hover:bg-cyan-500/30 transition-colors flex items-center justify-center gap-2">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download .ics invite
            </button>

            {/* Google Calendar button (Phase H) */}
            <button
              onClick={handleGoogleCalendar}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs font-mono hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Add to Google Calendar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
