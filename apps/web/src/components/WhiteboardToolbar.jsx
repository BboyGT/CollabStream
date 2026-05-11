import { useState, useEffect } from 'react'

const PRESET_COLORS = [
  { label: 'Black', value: '#000000' },
  { label: 'Red', value: '#ef4444' },
  { label: 'Cyan', value: '#22d3ee' },
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Green', value: '#22c55e' },
  { label: 'Amber', value: '#f59e0b' },
]

export default function WhiteboardToolbar({
  onSetMode,
  onClear,
  onUndo,
  onDownload,
  onExit,
  currentMode,
  annotationColor,
  onColorChange,
  strokeWidth,
  onStrokeWidthChange,
  isHost = true,
}) {
  const [hint, setHint] = useState(true)
  const [hintDismissed, setHintDismissed] = useState(false)

  useEffect(() => {
    if (hintDismissed) return
    const t = setTimeout(() => setHint(false), 3000)
    return () => clearTimeout(t)
  }, [hintDismissed])

  function dismissHint() {
    setHint(false)
    setHintDismissed(true)
  }

  const btnBase = {
    background: 'none',
    border: '1px solid rgba(51,65,85,0.6)',
    borderRadius: 8,
    padding: '4px 10px',
    fontSize: 11,
    fontFamily: 'monospace',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    whiteSpace: 'nowrap',
    transition: 'background 0.1s',
  }

  function modeBtn(label, mode, icon) {
    const active = currentMode === mode
    return (
      <button
        key={mode}
        onClick={() => onSetMode(mode)}
        style={{
          ...btnBase,
          background: active ? 'rgba(34,211,238,0.15)' : 'rgba(15,23,42,0.85)',
          border: active ? '1px solid rgba(34,211,238,0.4)' : '1px solid rgba(51,65,85,0.6)',
          color: active ? '#22d3ee' : '#94a3b8',
        }}
      >
        {icon}
        {label}
      </button>
    )
  }

  const divider = <div style={{ width: 1, height: 22, background: 'rgba(51,65,85,0.6)', flexShrink: 0 }} />

  return (
    <>
      {/* Main toolbar — floating at top-center */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          background: 'rgba(2,6,15,0.92)',
          border: '1px solid rgba(51,65,85,0.7)',
          borderRadius: 99,
          boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
          flexWrap: 'nowrap',
          overflowX: 'auto',
          maxWidth: 'calc(100vw - 32px)',
        }}
      >
        {/* Draw */}
        {modeBtn('Draw', 'annotate',
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        )}

        {/* Laser */}
        {modeBtn('Laser', 'laser',
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="3" />
            <line x1="12" y1="2" x2="12" y2="5" /><line x1="12" y1="19" x2="12" y2="22" />
            <line x1="2" y1="12" x2="5" y2="12" /><line x1="19" y1="12" x2="22" y2="12" />
          </svg>
        )}

        {/* Eraser (host only) */}
        {isHost && modeBtn('Erase', 'eraser',
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M20 20H7L3 16l11.5-11.5a2 2 0 0 1 2.83 0l3.17 3.17a2 2 0 0 1 0 2.83L14 17" />
          </svg>
        )}

        {/* Text */}
        {modeBtn('Text', 'text',
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="4 7 4 4 20 4 20 7" />
            <line x1="9" y1="20" x2="15" y2="20" />
            <line x1="12" y1="4" x2="12" y2="20" />
          </svg>
        )}

        {/* Arrow */}
        {modeBtn('Arrow', 'arrow',
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="19" x2="19" y2="5" />
            <polyline points="12 5 19 5 19 12" />
          </svg>
        )}

        {divider}

        {/* Color swatches */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {PRESET_COLORS.map((c) => (
            <button
              key={c.value}
              title={c.label}
              onClick={() => onColorChange?.(c.value)}
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: c.value,
                border: annotationColor === c.value ? '2px solid #fff' : '2px solid transparent',
                cursor: 'pointer',
                flexShrink: 0,
                padding: 0,
                outline: 'none',
                boxShadow: annotationColor === c.value ? '0 0 0 1px rgba(255,255,255,0.3)' : 'none',
              }}
            />
          ))}
        </div>

        {/* Stroke width */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace' }}>W</span>
          <input
            type="range"
            min={1}
            max={12}
            value={strokeWidth || 3}
            onChange={(e) => onStrokeWidthChange?.(Number(e.target.value))}
            style={{ width: 64, accentColor: '#22d3ee', cursor: 'pointer' }}
          />
        </div>

        {divider}

        {/* Undo */}
        <button onClick={onUndo} style={{ ...btnBase, background: 'rgba(15,23,42,0.85)', color: '#94a3b8' }} title="Undo">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 7v6h6" /><path d="M3 13C5.36 7.86 11 4.5 17 5a10 10 0 0 1 4 19" />
          </svg>
          Undo
        </button>

        {/* Clear */}
        <button onClick={onClear} style={{ ...btnBase, background: 'rgba(15,23,42,0.85)', color: '#94a3b8' }} title="Clear all">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6M14 11v6M9 6V4h6v2" />
          </svg>
          Clear
        </button>

        {/* Save (host only) */}
        {isHost && onDownload && (
          <button onClick={onDownload} style={{ ...btnBase, background: 'rgba(15,23,42,0.85)', color: '#94a3b8' }} title="Save as PNG">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Save
          </button>
        )}

        {divider}

        {/* Exit (host only) */}
        {isHost && onExit && (
          <button
            onClick={onExit}
            style={{ ...btnBase, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}
            title="Exit whiteboard"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Exit
          </button>
        )}
      </div>

      {/* Onboarding hint */}
      {hint && (
        <div
          onClick={dismissHint}
          style={{
            position: 'absolute',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 20,
            padding: '8px 16px',
            background: 'rgba(2,6,15,0.88)',
            border: '1px solid rgba(51,65,85,0.6)',
            borderRadius: 99,
            fontSize: 11,
            fontFamily: 'monospace',
            color: '#94a3b8',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
            animation: 'fade-in 0.3s ease both',
          }}
        >
          Draw, laser, or annotate — all guests see your marks in real time
        </div>
      )}
    </>
  )
}
