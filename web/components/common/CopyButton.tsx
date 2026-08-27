import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.tsx'

/** Copies `text` to the clipboard; the icon flips into a check briefly. */
export default function CopyButton({ text }: { readonly text: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current)
  }, [])

  return (
    <button
      type="button"
      className={`ui-icon-btn ui-icon-btn-sm ui-icon-btn-ghost ${copied ? 'copied-ok' : ''}`}
      title={copied ? 'Đã sao chép' : 'Sao chép'}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          if (timer.current !== null) clearTimeout(timer.current)
          timer.current = setTimeout(() => setCopied(false), 1_200)
        })
      }}
    >
      <Icon name={copied ? 'check' : 'copy'} size={14} />
    </button>
  )
}
