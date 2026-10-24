import { createContext, useCallback, useContext, useRef, useState } from 'react'

type ShowToast = (message: string) => void

const ToastContext = createContext<ShowToast>(() => {})

export function useToast(): ShowToast {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const show = useCallback((next: string) => {
    setMessage(next)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMessage(null), 1800)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex justify-center px-6 lg:bottom-8"
      >
        {message ? (
          <div className="rounded-full bg-[#111827] px-4 py-2 text-[13px] text-white shadow-lg">
            {message}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  )
}
