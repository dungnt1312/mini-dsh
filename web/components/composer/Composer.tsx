import { useRef, useState } from 'react'
import Icon from '../common/Icon.tsx'
import { Button } from '../ui/Button.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { Select } from '../ui/Select.tsx'
import type { ModelOption } from '../../lib/providers.ts'

/**
 * Control-center composer: autosizing textarea over an action row holding
 * the provider/model picker and stop/send. Enter sends, Shift+Enter breaks a
 * line; while a turn runs the send square becomes Stop.
 */
export function Composer({
  connected,
  running,
  draft,
  onDraft,
  onSend,
  onStop,
  modelValue,
  modelOptions,
  onModel,
}: {
  readonly connected: boolean
  readonly running: boolean
  readonly draft: string
  readonly onDraft: (value: string) => void
  readonly onSend: () => void
  readonly onStop: () => void
  readonly modelValue: string | null
  readonly modelOptions: readonly ModelOption[]
  readonly onModel: (value: string) => void
}) {
  const area = useRef<HTMLTextAreaElement | null>(null)
  const [focused, setFocused] = useState(false)

  const resize = (element: HTMLTextAreaElement): void => {
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`
  }

  const submit = (): void => {
    if (running || draft.trim() === '' || !connected || modelValue === null) return
    onSend()
  }

  return (
    <form
      className={`composer ${focused ? 'composer-focused' : ''}`}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <textarea
        ref={area}
        className="composer-input"
        value={draft}
        rows={1}
        placeholder={connected
          ? (modelValue === null ? 'Chọn provider trong Settings trước…' : 'Message…  (Enter gửi · Shift+Enter xuống dòng)')
          : 'connecting…'}
        disabled={!connected || modelValue === null}
        onChange={(event) => {
          onDraft(event.target.value)
          resize(event.currentTarget)
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            submit()
          }
        }}
      />
      <div className="composer-actions">
        <span className="composer-spacer" />
        {modelValue !== null && modelOptions.length > 0 ? (
          <Select
            value={modelValue}
            options={modelOptions}
            onChange={onModel}
            label="Chọn provider và model"
            triggerClassName="composer-model"
          />
        ) : null}
        {running ? (
          <Button type="button" variant="outline-danger" size="sm" title="Dừng agent" onClick={onStop}>
            <Icon name="square" size={11} />
            Stop
          </Button>
        ) : (
          <IconButton
            label="Gửi (Enter)"
            variant="solid"
            size="md"
            type="submit"
            disabled={draft.trim() === '' || !connected || modelValue === null}
          >
            <Icon name="send" size={15} />
          </IconButton>
        )}
      </div>
    </form>
  )
}
