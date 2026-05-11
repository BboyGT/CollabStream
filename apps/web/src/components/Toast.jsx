import { createContext, useCallback, useContext, useRef, useState } from 'react'

const ToastContext = createContext(null)

const COLORS = {
  success: 'bg-emerald-950/90 border-emerald-700 text-emerald-200',
  warn:    'bg-amber-950/90 border-amber-700 text-amber-200',
  info:    'bg-slate-900/90 border-slate-700 text-slate-200',
  error:   'bg-red-950/90 border-red-700 text-red-200',
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const counterRef = useRef(0)

  const toast = useCallback(({ message, type = 'info', duration = 3000 }) => {
    const id = ++counterRef.current
    setToasts((prev) => [...prev.slice(-2), { id, message, type, duration }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, duration)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-enter relative overflow-hidden px-4 py-2.5 rounded-xl border text-xs font-mono shadow-lg max-w-xs ${COLORS[t.type] || COLORS.info}`}
          >
            {t.message}
            {/* progress bar */}
            <div
              className="absolute bottom-0 left-0 h-0.5 bg-current opacity-30"
              style={{ animation: `progressDrain ${t.duration}ms linear forwards` }}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
