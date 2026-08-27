import { useRef, useState } from 'react'
import Icon from '../common/Icon.tsx'
import { Button } from '../ui/Button.tsx'
import { IconButton } from '../ui/IconButton.tsx'
import { Select } from '../ui/Select.tsx'

/**
 * Control-center composer: autosizing textarea over an action row holding
 * the model picker and stop/send. Enter sends, Shift+Enter breaks a line;
 * while a turn runs the send square becomes Stop.
 */
export function Composer({
  connected,
  running,
  draft,
  onDraft,
  onSend,
  onStop,
  model,
  models,
  onModel,
}: {
  readonly connected: boolean
  readonly running: boolean
  readonly draft: string
  readonly onDraft: (value: string) => void
  readonly onSend: () => void
  readonly onStop: () => void
  readonly model: string | null
  readonly models: readonly string[]
  readonly onModel: (model: string) => void
}) {
  const area = useRef<HTMLTextAreaElement | null>(null)
  const [focused, setFocused] = useState(false)

  const resize = (element: HTMLTextAreaElement): void => {
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`
  }

  const submit = (): void => {
    if (running || draft.trim() === '' || !connected) return
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
          ? 'Message…  (Enter gửi · Shift+Enter xuống dòng)'
          : 'connecting…'}
        disabled={!connected}
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
        {model !== null && models.length > 0 ? (
          <Select
            value={model}
            options={models.map((name) => ({ value: name, label: name }))}
            onChange={onModel}
            label="Chọn model"
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
            disabled={draft.trim() === '' || !connected}
          >
            <Icon name="send" size={15} />
          </IconButton>
        )}
      </div>
    </form>
  )
}
