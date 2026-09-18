import Icon from '../common/Icon.tsx'
import { Menu, menuItemClass } from '../ui/Menu.tsx'
import { cn } from '../../lib/cn.ts'

export interface ScopePicker {
  readonly value: string | null
  readonly options: readonly { readonly id: string | null; readonly name: string; readonly path: string }[]
  readonly onChange: (id: string | null) => void
  readonly onPickFolder: () => void
}

const chipClass = 'flex h-9 min-w-0 max-w-[16rem] items-center gap-1.5 rounded-lg px-2.5 text-sm text-fg-muted transition-colors hover:bg-hover hover:text-fg'
const staticChipClass = cn(chipClass, 'hover:bg-transparent hover:text-fg-muted')

/**
 * The conversation's folder, shown in the chat header. Before a conversation
 * exists it is a picker; afterwards it only shows the folder (or Chat only).
 */
export function ScopeControl({ scope, picker }: { readonly scope: string | null; readonly picker?: ScopePicker | undefined }) {
  if (picker !== undefined) {
    const selected = picker.options.find((option) => option.id === picker.value)
    return (
      <Menu
        label="Conversation scope — choose the project for the new conversation"
        panelClassName="w-80"
        triggerClassName={chipClass}
        trigger={(open) => (
          <>
            <Icon name={picker.value === null ? 'messageSquare' : 'folder'} size={15} className="shrink-0" />
            <span className="truncate">{selected?.name ?? 'Chat only'}</span>
            <Icon name="chevron" size={13} className={cn('shrink-0 text-fg-faint transition-transform', open && 'rotate-180')} />
          </>
        )}
      >
        {(close) => (
          <>
            <div className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-fg-faint">Project for this conversation</div>
            {picker.options.map((option) => (
              <button
                key={option.id ?? 'chat-only'}
                type="button"
                role="menuitemradio"
                aria-checked={option.id === picker.value}
                className={menuItemClass}
                onClick={() => { picker.onChange(option.id); close() }}
              >
                <Icon name={option.id === null ? 'messageSquare' : 'folder'} size={15} className="text-fg-muted" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{option.name}</span>
                  <span className="truncate text-xs text-fg-faint">{option.path}</span>
                </span>
                {option.id === picker.value ? <Icon name="check" size={15} /> : null}
              </button>
            ))}
            <div className="my-1 h-px bg-line" />
            <button type="button" role="menuitem" className={menuItemClass} onClick={() => { picker.onPickFolder(); close() }}>
              <Icon name="plus" size={15} className="text-fg-muted" />
              Choose folder…
            </button>
          </>
        )}
      </Menu>
    )
  }
  if (scope !== null) {
    return (
      <span className={staticChipClass} title={scope}>
        <Icon name="folder" size={15} className="shrink-0" />
        <span className="truncate">{scope.split(/[\\/]/).at(-1)}</span>
      </span>
    )
  }
  return (
    <span
      className={cn(staticChipClass, 'cursor-help')}
      title="No folder is attached, so file and shell tools are unavailable."
      aria-label="Chat only. No folder is attached, so file and shell tools are unavailable."
    >
      <Icon name="messageSquare" size={15} className="shrink-0" />
      Chat only
    </span>
  )
}
