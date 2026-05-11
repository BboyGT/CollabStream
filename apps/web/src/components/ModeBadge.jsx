import useSession from '../store/session.js'

const config = {
  view: {
    label: 'Viewing',
    className: 'bg-slate-900 text-slate-300 border-slate-700',
    dot: 'bg-slate-400',
  },
  annotate: {
    label: 'Annotating',
    className: 'bg-cyan-950 text-cyan-200 border-cyan-700',
    dot: 'bg-cyan-400',
  },
  control: {
    label: 'In Control',
    className: 'bg-red-950 text-red-300 border-red-700 animate-pulse-ring',
    dot: 'bg-red-400',
  },
  laser: {
    label: 'Laser',
    className: 'bg-amber-950 text-amber-200 border-amber-700',
    dot: 'bg-amber-300',
  },
}

export default function ModeBadge() {
  const { mode } = useSession()
  const c = config[mode] || config.view

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-mono font-medium tracking-wider uppercase transition-all duration-300 ${c.className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </div>
  )
}
