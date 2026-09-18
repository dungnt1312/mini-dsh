// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteMcpServer, getMcpServer, importMcpServers, upsertMcpServer } from '../../lib/api.ts'
import { McpPanel } from './McpPanel.tsx'
import { AgentsPanel } from './AgentsPanel.tsx'
import { SettingsModal } from './SettingsModal.tsx'

vi.mock('../../lib/api.ts', () => ({
  listMcpServers: vi.fn(async () => [{ name: 'fs', transport: 'stdio', enabled: false, status: 'disabled', breakerOpenUntil: null }]),
  getMcpServer: vi.fn(async () => ({ name: 'fs', transport: 'stdio', command: 'npx', args: ['-y', 'fs-mcp'], env: { API_KEY: '${API_KEY}' }, enabled: false, timeoutMs: 5000 })),
  upsertMcpServer: vi.fn(async () => ({ saved: 'fs', enabled: false })),
  deleteMcpServer: vi.fn(async () => ({ deleted: 'fs' })),
  importMcpServers: vi.fn(async () => ({ imported: ['x'] })),
  setMcpServerAction: vi.fn(async () => ({ status: 'ready' })),
  listAgentDefinitions: vi.fn(async () => []),
  listChildren: vi.fn(async () => []),
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  vi.clearAllMocks()
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const buttons = (): HTMLButtonElement[] => [...document.body.querySelectorAll<HTMLButtonElement>('button')]
const button = (name: string): HTMLButtonElement => {
  const found = buttons().find((node) => node.textContent === name || node.getAttribute('aria-label') === name)
  if (found === undefined) throw new Error(`no button "${name}"`)
  return found
}
const input = (label: string): HTMLInputElement | HTMLTextAreaElement => {
  const found = [...document.body.querySelectorAll('label')].find((node) => node.textContent === label)?.control
  if (!(found instanceof HTMLInputElement || found instanceof HTMLTextAreaElement)) throw new Error(`no field "${label}"`)
  return found
}
function type(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}
const settle = async (): Promise<void> => { await act(async () => { await Promise.resolve() }) }

describe('MCP panel', () => {
  it('edits a server by merging the form into its stored config, keeping env', async () => {
    await act(async () => root.render(<McpPanel workspaceId="ws" />))
    await settle()
    await act(async () => button('Edit fs').click())
    expect(getMcpServer).toHaveBeenCalledWith('ws', 'fs')
    expect(input('Command').value).toBe('npx')
    expect((input('Server name') as HTMLInputElement).disabled).toBe(true)
    await act(async () => type(input('Command'), 'node'))
    await act(async () => button('Save changes').click())
    expect(upsertMcpServer).toHaveBeenCalledWith('ws', 'fs', expect.objectContaining({
      transport: 'stdio', command: 'node', args: ['-y', 'fs-mcp'], env: { API_KEY: '${API_KEY}' }, timeoutMs: 5000,
    }))
  })

  it('deletes a server only after an inline confirmation', async () => {
    await act(async () => root.render(<McpPanel workspaceId="ws" />))
    await settle()
    await act(async () => button('Delete fs').click())
    expect(deleteMcpServer).not.toHaveBeenCalled()
    await act(async () => button('Delete server').click())
    expect(deleteMcpServer).toHaveBeenCalledTimes(1)
    expect(deleteMcpServer).toHaveBeenCalledWith('ws', 'fs')
  })

  it('switches transport as one choice and refuses invalid numbers', async () => {
    await act(async () => root.render(<McpPanel workspaceId="ws" />))
    await settle()
    await act(async () => button('Streamable HTTP').click())
    expect(button('Streamable HTTP').getAttribute('aria-pressed')).toBe('true')
    expect(button('stdio').getAttribute('aria-pressed')).toBe('false')
    expect(input('URL')).toBeTruthy()
    await act(async () => { type(input('Server name'), 'remote'); type(input('URL'), 'https://mcp.example.com/mcp') })
    expect(button('Add server').disabled).toBe(false)
    await act(async () => type(input('Memory limit (MB)'), 'abc'))
    expect(button('Add server').disabled).toBe(true)
    expect(upsertMcpServer).not.toHaveBeenCalled()
  })

  it('imports Codex configuration with its pinned version', async () => {
    await act(async () => root.render(<McpPanel workspaceId="ws" />))
    await settle()
    await act(async () => button('Codex (pinned)').click())
    await act(async () => type(input('Content'), '[mcp_servers.x]'))
    expect(button('Import servers').disabled).toBe(true)
    await act(async () => type(input('Pinned Codex version'), '0.9.0'))
    await act(async () => button('Import servers').click())
    expect(importMcpServers).toHaveBeenCalledWith('ws', { content: '[mcp_servers.x]', dialect: 'codex', sourceVersion: '0.9.0' })
  })
})

describe('agents panel', () => {
  it('shows a real multi-line import placeholder', async () => {
    await act(async () => root.render(<AgentsPanel workspaceId="ws" rootSessionId={null} />))
    const placeholder = input('Definition content').getAttribute('placeholder') ?? ''
    expect(placeholder).toContain('\n')
    expect(placeholder).not.toContain('\\n')
  })
})

describe('settings dialog', () => {
  const providers = [{ id: 'p1', name: 'local', baseUrl: 'http://localhost:8080/v1', enabled: true, keyMasked: '', models: ['auto'], defaultModel: 'auto' }] as const
  const render = async (): Promise<void> => {
    await act(async () => root.render(
      <SettingsModal open workspaceId="ws" providers={providers} activeProvider="p0" onDismiss={() => {}} onRefresh={async () => {}} onSelectActive={async () => {}} />,
    ))
  }

  it('shows the real provider when the list arrives after Settings opened', async () => {
    await act(async () => root.render(
      <SettingsModal open workspaceId="ws" providers={[]} activeProvider="p1" onDismiss={() => {}} onRefresh={async () => {}} onSelectActive={async () => {}} />,
    ))
    expect(input('Name').value).toBe('')
    await render()
    expect(input('Name').value).toBe('local')
    expect(button('Save changes')).toBeTruthy()
  })

  it('gives every section tab an icon', async () => {
    await render()
    const tabs = [...document.body.querySelectorAll('[role="tab"]')]
    expect(tabs).toHaveLength(8)
    for (const tab of tabs) expect(tab.querySelector('svg')).not.toBeNull()
  })

  it('offers the global default and the connection test only for saved configuration', async () => {
    await render()
    expect(button('Set as global default').disabled).toBe(false)
    expect(button('Test connection').disabled).toBe(false)
    await act(async () => type(input('Name'), 'local edited'))
    expect(button('Set as global default').disabled).toBe(true)
    expect(button('Set as global default').title).toBe('Save or discard your changes first.')
    expect(button('Test connection').disabled).toBe(true)
  })
})
