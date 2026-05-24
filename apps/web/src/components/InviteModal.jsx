import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export default function InviteModal({ open, onClose, joinCode, shortCode, joinUrl, lanUrl, invalid, title }) {
  const [qr, setQr] = useState(null)
  const [lanQr, setLanQr] = useState(null)
  const [ngrokTip, setNgrokTip] = useState(false)
  const safeJoinUrl = typeof joinUrl === 'string' ? joinUrl : ''
  const safeLanUrl = typeof lanUrl === 'string' ? lanUrl : ''

  const isLocal = safeJoinUrl.includes('localhost') || safeJoinUrl.includes('127.0.0.1')
  const isNgrok = !isLocal && (safeJoinUrl.includes('ngrok') || safeJoinUrl.includes('ngrok-free'))
  const hasLan = !!(safeLanUrl && safeLanUrl !== safeJoinUrl)

  const [qrMode, setQrMode] = useState(() => (isNgrok ? 'ngrok' : 'lan'))

  // Reset mode when modal opens
  useEffect(() => {
    if (!open) return
    setQrMode(isNgrok ? 'ngrok' : 'lan')
  }, [open, isNgrok])

  useEffect(() => {
    if (!open || !safeJoinUrl) return
    QRCode.toDataURL(safeJoinUrl, { margin: 1, width: 220 })
      .then(setQr)
      .catch(() => setQr(null))
  }, [open, safeJoinUrl])

  useEffect(() => {
    if (!open || !safeLanUrl || safeLanUrl === safeJoinUrl) return
    QRCode.toDataURL(safeLanUrl, { margin: 1, width: 220 })
      .then(setLanQr)
      .catch(() => setLanQr(null))
  }, [open, safeLanUrl, safeJoinUrl])

  if (!open) return null

  const activeQr = qrMode === 'lan' ? lanQr : qr
  const activeUrl = qrMode === 'lan' ? safeLanUrl : safeJoinUrl
  const showToggle = isNgrok && hasLan

  return (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="modal-enter bg-slate-950 border border-slate-800 rounded-2xl p-6 w-[90%] max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-slate-100 text-sm font-mono">Invite</h3>
          <button onClick={onClose} className="text-xs font-mono text-slate-500 hover:text-slate-200">Close</button>
        </div>

        <div className="text-slate-400 text-xs mb-3">
          {title ? `${title} \u2014 ` : ''}Share this code or scan the QR to join.
        </div>

        {/* Join codes */}
        <div className="flex items-center justify-between mb-2">
          <div className="text-slate-200 font-mono text-lg tracking-wider">{joinCode || '\u2014'}</div>
          <button
            onClick={() => navigator.clipboard.writeText(joinCode || '')}
            className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-200 text-xs font-mono hover:bg-slate-800"
          >
            Copy code
          </button>
        </div>
        {shortCode && shortCode !== joinCode && (
          <div className="flex items-center justify-between mb-3">
            <div className="text-slate-200 font-mono text-lg tracking-wider">{shortCode}</div>
            <button
              onClick={() => navigator.clipboard.writeText(shortCode || '')}
              className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-200 text-xs font-mono hover:bg-slate-800"
            >
              Copy short
            </button>
          </div>
        )}

        {/* QR toggle (only when both ngrok and LAN available) */}
        {showToggle && (
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => setQrMode('ngrok')}
              className={`px-3 py-1 rounded-full text-[11px] font-mono border transition-all ${
                qrMode === 'ngrok'
                  ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              Internet (ngrok)
            </button>
            <button
              onClick={() => setQrMode('lan')}
              className={`px-3 py-1 rounded-full text-[11px] font-mono border transition-all ${
                qrMode === 'lan'
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              Same WiFi (LAN)
            </button>
          </div>
        )}

        {/* Mode hint line */}
        {showToggle && (
          <div className="text-[10px] font-mono text-slate-500 mb-3">
            {qrMode === 'ngrok'
              ? 'Works from anywhere \u2014 any network, any device'
              : 'Same WiFi only \u2014 faster, no relay'}
          </div>
        )}

        {/* Single QR */}
        {activeQr && (
          <div className="flex flex-col items-center mb-3">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                {qrMode === 'ngrok' ? 'Internet QR' : qrMode === 'lan' ? 'LAN QR' : 'Join QR'}
              </div>
              {/* ngrok warning icon tooltip */}
              {isNgrok && qrMode === 'ngrok' && (
                <div className="relative">
                  <button
                    onMouseEnter={() => setNgrokTip(true)}
                    onMouseLeave={() => setNgrokTip(false)}
                    className="text-amber-400 text-[11px] leading-none focus:outline-none"
                    aria-label="ngrok note"
                  >
                    ⚠
                  </button>
                  {ngrokTip && (
                    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-52 px-3 py-2 bg-slate-950 border border-amber-800/60 rounded-xl text-[11px] font-mono text-amber-200 z-50 shadow-xl pointer-events-none">
                      QR uses your current ngrok URL. Re-scan if the URL changes after ngrok restarts.
                    </div>
                  )}
                </div>
              )}
            </div>
            <img src={activeQr} alt="Join QR" className="rounded-lg border border-slate-800" />
          </div>
        )}

        {/* LAN not available note */}
        {isNgrok && !hasLan && (
          <div className="text-[11px] text-slate-500 mb-3">
            LAN QR not available \u2014 server did not return a local IP.
          </div>
        )}

        {invalid && (
          <div className="text-[11px] text-red-300/90 mb-3">
            This session code is no longer valid. Go back to the home page and start a new session.
          </div>
        )}

        {isLocal && !isNgrok && (
          <div className="text-[11px] text-amber-300/90 mb-3">
            This link points to localhost. For phone testing, set{' '}
            <code>VITE_PUBLIC_URL</code> to your ngrok URL or LAN IP.
          </div>
        )}

        <button
          onClick={() => navigator.clipboard.writeText(activeUrl || '')}
          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs font-mono hover:bg-slate-800"
        >
          Copy link
        </button>
      </div>
    </div>
  )
}
