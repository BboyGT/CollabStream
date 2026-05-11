import useSession from '../store/session.js'
import { flags } from '../lib/flags.js'

const COLORS = [
  { hex: '#ef4444', label: 'Red' },
  { hex: '#facc15', label: 'Yellow' },
  { hex: '#34d399', label: 'Green' },
  { hex: '#60a5fa', label: 'Blue' },
  { hex: '#ffffff', label: 'White' },
]

const SIZES = [2, 4, 7]

export default function AnnotationToolbar({ onClear, onUndo, onSetMode }) {
  const {
    mode, annotationColor, annotationSize, annotationTool,
    setAnnotationColor, setAnnotationSize, setAnnotationTool,
  } = useSession()

  if (mode === 'control') return null

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 glass rounded-2xl border border-slate-700/60 animate-slide-up">
      {/* Mode toggle */}
      <button
        onClick={() => onSetMode(mode === 'annotate' ? 'view' : 'annotate')}
        title={mode === 'annotate' ? 'Stop annotating' : 'Start annotating'}
        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium border transition-all duration-200 ${
          mode === 'annotate'
            ? 'bg-cyan-500 border-cyan-400 text-slate-900'
            : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-slate-100'
        }`}
      >
        {mode === 'annotate' ? '✏ Drawing' : '✏ Draw'}
      </button>

      {flags.laser && (
        <button
          onClick={() => onSetMode(mode === 'laser' ? 'view' : 'laser')}
          title={mode === 'laser' ? 'Stop laser' : 'Laser pointer'}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium border transition-all duration-200 ${
            mode === 'laser'
              ? 'bg-amber-400 border-amber-300 text-slate-900'
              : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-slate-100'
          }`}
        >
          ◎ Laser
        </button>
      )}

      {mode === 'annotate' && (
        <>
          {/* Divider */}
          <div className="w-px h-5 bg-slate-700" />

          {/* Tools */}
          <div className="flex items-center gap-1.5">
            {[
              { id: 'pen', label: 'Pen' },
              { id: 'highlight', label: 'Highlight' },
              { id: 'arrow', label: 'Arrow' },
              { id: 'rect', label: 'Box' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setAnnotationTool(t.id)}
                title={t.label}
                className={`px-2.5 py-1 rounded-lg border text-xs font-mono transition-all ${
                  annotationTool === t.id
                    ? 'bg-cyan-500 border-cyan-400 text-slate-900'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-slate-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="w-px h-5 bg-slate-700" />

          {/* Sizes */}
          <div className="flex items-center gap-1.5">
            {SIZES.map((s) => (
              <button
                key={s}
                onClick={() => setAnnotationSize(s)}
                title={`Size ${s}`}
                className={`rounded-full flex items-center justify-center transition-all duration-150 ${
                  annotationSize === s ? 'ring-2 ring-cyan-400 ring-offset-1 ring-offset-slate-950' : ''
                }`}
                style={{ width: s * 4 + 8, height: s * 4 + 8, minWidth: 16, minHeight: 16 }}
              >
            <span
              className="rounded-full bg-slate-200"
              style={{ width: s * 2 + 2, height: s * 2 + 2 }}
            />
          </button>
            ))}
          </div>

          {/* Divider */}
          <div className="w-px h-5 bg-slate-700" />

          {/* Colors */}
          <div className="flex items-center gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c.hex}
                onClick={() => setAnnotationColor(c.hex)}
                title={c.label}
                className={`w-5 h-5 rounded-full border-2 transition-all duration-150 ${
                  annotationColor === c.hex
                    ? 'border-slate-100 scale-125'
                    : 'border-transparent hover:scale-110'
                }`}
                style={{ background: c.hex }}
              />
            ))}
          </div>

          {/* Divider */}
          <div className="w-px h-5 bg-slate-700" />

          {/* Clear */}
          <button
            onClick={onClear}
            title="Clear canvas"
            className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-red-300 hover:border-red-800 text-xs font-mono transition-all duration-200"
          >
            Clear
          </button>

          <button
            onClick={onUndo}
            title="Undo last stroke"
            className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-slate-100 text-xs font-mono transition-all duration-200"
          >
            Undo
          </button>
        </>
      )}
    </div>
  )
}
