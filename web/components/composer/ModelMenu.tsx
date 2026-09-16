import { useEffect, useRef, useState } from 'react'
import { Menu } from '../ui/Menu.tsx'
import Icon from '../common/Icon.tsx'
import { capabilityBadges } from '../../lib/model-info.ts'
import { decodeModelChoice, type ModelOption } from '../../lib/providers.ts'
import type { ModelSettings, ProviderSummary } from '../../lib/types.ts'

/**
 * Two-pane model picker (dntspace layout): a search field over a provider
 * list on the left and the previewed provider's models on the right, with a
 * `Manage models` footer. Selecting a row writes the exact provider/model
 * pair. Rows carry capability badges from the shared catalog (vision /
 * reasoning), never name guesses.
 */
export function ModelMenu({
  modelLabel,
  modelValue,
  options,
  providers,
  modelSettings,
  onModel,
  onManage,
}: {
  readonly modelLabel: string
  readonly modelValue: string | null
  readonly options: readonly ModelOption[]
  readonly providers: readonly ProviderSummary[]
  readonly modelSettings?: Readonly<Record<string, ModelSettings>>
  readonly onModel: (value: string) => void
  readonly onManage: () => void
}) {
  const boundary = modelValue !== null ? modelValue.indexOf(':') : -1
  const activeProvider = modelValue !== null && boundary > 0 ? modelValue.slice(0, boundary) : null
  const byProvider = new Map<string, ModelOption[]>()
  for (const option of options) {
    const list = byProvider.get(option.provider) ?? []
    list.push(option)
    byProvider.set(option.provider, list)
  }
  const enabled = providers.filter((provider) => provider.enabled)
  const activeModelId = activeProvider !== null ? decodeModelChoice(modelValue ?? '')?.model ?? null : null

  return (
    <Menu
      label="Workspace model (next request)"
      panelClassName="model-picker-panel"
      panelRole="dialog"
      panelWidth={470}
      triggerClassName="ui-select-trigger composer-model-trigger"
      trigger={() => (
        <>
          <span className="composer-model-label">{modelLabel}</span>
          <Icon name="chevron" size={11} className="chevron" />
        </>
      )}
    >
      {(close) => (
        <PickerPanel
          enabled={enabled}
          byProvider={byProvider}
          activeProvider={activeProvider}
          activeModelId={activeModelId}
          modelSettings={modelSettings ?? {}}
          onModel={(value) => {
            onModel(value)
            close()
          }}
          onManage={() => {
            close()
            onManage()
          }}
        />
      )}
    </Menu>
  )
}

/**
 * The picker body, mounted only while the panel is open — its unmount
 * cleanup resets the search query and provider preview for the next open.
 */
function PickerPanel({
  enabled,
  byProvider,
  activeProvider,
  activeModelId,
  modelSettings,
  onModel,
  onManage,
}: {
  readonly enabled: readonly ProviderSummary[]
  readonly byProvider: ReadonlyMap<string, readonly ModelOption[]>
  readonly activeProvider: string | null
  readonly activeModelId: string | null
  readonly modelSettings?: Readonly<Record<string, ModelSettings>>
  readonly onModel: (value: string) => void
  readonly onManage: () => void
}) {
  const [query, setQuery] = useState('')
  const [previewId, setPreviewId] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  // Reset on close: this component unmounts with the portaled panel.
  useEffect(() => {
    searchRef.current?.focus()
    return () => {
      setQuery('')
      setPreviewId(null)
    }
  }, [])

  const q = query.trim().toLowerCase()
  const matches = (option: ModelOption): boolean => q === '' || option.model.toLowerCase().includes(q) || option.label.toLowerCase().includes(q)
  const visible = enabled.filter((provider) => q === '' || (byProvider.get(provider.id) ?? []).some(matches))
  const preview = visible.find((provider) => provider.id === previewId)
    ?? visible.find((provider) => provider.id === activeProvider)
    ?? visible[0]
    ?? null
  const previewOptions = preview !== null ? (byProvider.get(preview.id) ?? []).filter(matches) : []

  const previewAt = (index: number): void => {
    const next = visible[index]
    if (next !== undefined) setPreviewId(next.id)
  }
  const onProviderKey = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (visible.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      previewAt((visible.findIndex((provider) => provider.id === preview?.id) + 1) % visible.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      previewAt((visible.findIndex((provider) => provider.id === preview?.id) - 1 + visible.length) % visible.length)
    }
  }

  return (
    <div className="model-picker">
      <div className="model-picker-search">
        <Icon name="search" size={13} />
        <input
          ref={searchRef}
          type="search"
          value={query}
          placeholder="Search models…"
          aria-label="Search models"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && query !== '') {
              event.preventDefault()
              event.stopPropagation()
              setQuery('')
            }
          }}
        />
      </div>
      <div className="model-picker-body">
        <div className="model-picker-provider-list" role="listbox" aria-label="Providers" tabIndex={-1} onKeyDown={onProviderKey}>
          {enabled.length === 0 ? (
            <p className="model-picker-empty">No providers</p>
          ) : visible.length === 0 ? (
            <p className="model-picker-empty">No matches</p>
          ) : (
            visible.map((provider) => {
              const isActive = provider.id === activeProvider
              const isPreview = provider.id === preview?.id
              return (
                <button
                  key={provider.id}
                  type="button"
                  role="option"
                  aria-selected={isPreview}
                  className={`model-picker-provider ${isActive ? 'is-active' : ''} ${isPreview ? 'is-preview' : ''}`}
                  title={provider.name}
                  onMouseEnter={() => setPreviewId(provider.id)}
                  onFocus={() => setPreviewId(provider.id)}
                  onClick={() => setPreviewId(provider.id)}
                >
                  <span className="model-picker-provider-label">{provider.name}</span>
                  {isActive ? <Icon name="check" size={12} className="model-picker-provider-check" /> : null}
                  <Icon name="chevronRight" size={11} className="model-picker-provider-chevron" />
                </button>
              )
            })
          )}
        </div>
        <div className="model-picker-model-pane">
          <div className="model-picker-model-list" role="listbox" aria-label="Models">
            {preview !== null ? (
              <div className="model-picker-heading" title={preview.name}>{preview.name}</div>
            ) : null}
            {preview === null ? (
              <p className="model-picker-empty">{query.trim() !== '' ? 'No matching models' : 'No provider selected'}</p>
            ) : previewOptions.length === 0 ? (
              <p className="model-picker-empty">{query.trim() !== '' ? 'No matching models' : 'No models — sync in Settings'}</p>
            ) : (
              previewOptions.map((option) => {
                const isActive = option.provider === activeProvider && option.model === activeModelId
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className={`model-picker-model ${isActive ? 'is-active' : ''}`}
                    title={option.model}
                    onClick={() => onModel(option.value)}
                  >
                    <span className="model-picker-model-label">{option.model}</span>
                    <span className="model-picker-model-caps">
                      {capabilityBadges(option.model, modelSettings?.[option.model]).map((badge) => (
                        <span key={badge.label} className={`menu-cap menu-cap-${badge.tone}`}>{badge.label}</span>
                      ))}
                    </span>
                    {isActive ? <Icon name="check" size={12} className="model-picker-model-check" /> : null}
                  </button>
                )
              })
            )}
          </div>
          <button type="button" role="menuitem" className="model-picker-manage" onClick={onManage}>
            <Icon name="sliders" size={12} />
            <span>Manage models</span>
          </button>
        </div>
      </div>
    </div>
  )
}
