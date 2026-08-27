import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export type ToastKind = 'ok' | 'bad'

export interface ToastItem {
  readonly id: number
  readonly kind: ToastKind
  readonly text: string
}

interface ToastApi {
  notify(text: string, kind?: ToastKind): void
  dispose(id: number): void
}

const ToastContext = createContext<ToastApi | null>(null)

export function ToastHost({ children }: { readonly children: ReactNode }) {
  const [items, setItems] = useState<readonly ToastItem[]>([])

  const dispose = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const notify = useCallback((text: string, kind: ToastKind = 'bad') => {
    const id = Date.now() + Math.random()
    setItems((prev) => [...prev, { id, kind, text }])
    setTimeout(() => dispose(id), 4_000)
  }, [dispose])

  return (
    <ToastContext.Provider value={{ notify, dispose }}>
      {children}
      <div className="toasts" role="status">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`toast toast-${item.kind}`}
            onClick={() => dispose(item.id)}
          >
            {item.text}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/** Report a transient message (errors by default). Safe to call anywhere. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (api === null) throw new Error('useToast: missing <ToastHost>')
  return api
}
