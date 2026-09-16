import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.tsx'

/** Clipboard failures leave the source available for manual selection. */
export default function CopyButton({ text }: { readonly text: string }) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current) }, [])
  const copy = async () => {
    setFailed(false)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1_200)
    } catch {
      setCopied(false)
      setFailed(true)
    }
  }
  return <>
    <button type="button" className={`ui-icon-btn ui-icon-btn-sm ui-icon-btn-ghost ${copied ? 'copied-ok' : ''}`}
      title={copied ? 'Copied' : 'Copy'} aria-label={copied ? 'Copied to clipboard' : 'Copy to clipboard'} onClick={() => void copy()}>
      <Icon name={copied ? 'check' : 'copy'} size={14} />
    </button>
    {failed ? <span role="status">Could not copy. Select the text and copy it manually, or try again.</span> : null}
  </>
}
