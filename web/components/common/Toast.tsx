import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import Icon from './Icon.tsx'
import { ErrorNotice } from './ErrorNotice.tsx'

export type ToastKind = 'ok' | 'bad' | 'info'

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

/** Auto-dismiss per variant: ok 5s, info 5s, error 8s. */
const TOAST_TTL: Readonly<Record<ToastKind, number>> = { ok: 5_000, info: 5_000, bad: 8_000 }

const TOAST_ICONS: Readonly<Partial<Record<ToastKind, { name: 'check' | 'alertTriangle'; className: string }>>> = {
  ok: { name: 'check', className: 'toast-icon toast-icon-ok' },
  bad: { name: 'alertTriangle', className: 'toast-icon toast-icon-bad' },
}

export function ToastHost({ children }: { readonly children: ReactNode }) {
  const [items, setItems] = useState<readonly ToastItem[]>([])
  const timers = useRef(new Map<number, number>())

  const dispose = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
    const timer = timers.current.get(id)
    if (timer !== undefined) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const notify = useCallback((text: string, kind: ToastKind = 'bad') => {
    const id = Date.now() + Math.random()
    setItems((prev) => [...prev, { id, kind, text }])
    timers.current.set(id, window.setTimeout(() => dispose(id), TOAST_TTL[kind]))
  }, [dispose])

  useEffect(() => () => {
    for (const timer of timers.current.values()) window.clearTimeout(timer)
  }, [])

  return (
    <ToastContext.Provider value={{ notify, dispose }}>
      {children}
      <div className="toasts" role="status">
        {items.map((item) => {
          const icon = TOAST_ICONS[item.kind]
          return (
            <div key={item.id} className={`toast toast-${item.kind}`}>
              <div className="toast-body">
                {icon !== undefined ? <Icon name={icon.name} size={13} className={icon.className} /> : null}
                {item.kind === 'bad' ? <ErrorNotice raw={item.text} /> : <p>{item.text}</p>}
              </div>
              <button type="button" className="ui-btn ui-btn-ghost" aria-label="Dismiss notification" onClick={() => dispose(item.id)}>Dismiss</button>
            </div>
          )
        })}
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
