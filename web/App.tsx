import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  answerApproval,
  createSession,
  deleteSession,
  fetchMeta,
  listSessions,
  renameSession,
  sendMessage,
  setModel,
  setSessionFolder,
  stopSession,
} from './lib/api.ts'
import { decodeModelChoice, activeModelValue, modelOptions } from './lib/providers.ts'
import { isTurnRunning } from './lib/project.ts'
import { useSessionStream } from './hooks/useSessionStream.ts'
import { useHotkeys } from './hooks/useHotkeys.ts'
import { useToast } from './components/common/Toast.tsx'
import { Button } from './components/ui/Button.tsx'
import { Sidebar } from './components/layout/Sidebar.tsx'
import { TopBar } from './components/layout/TopBar.tsx'
import { EnvPanel } from './components/layout/EnvPanel.tsx'
import { SettingsModal } from './components/settings/SettingsModal.tsx'
import { Transcript } from './components/chat/Transcript.tsx'
import { ApprovalBar } from './components/chat/ApprovalBar.tsx'
import { Composer } from './components/composer/Composer.tsx'
import ConfirmDialog from './components/common/ConfirmDialog.tsx'
import type { Meta, SessionListing } from './lib/types.ts'

const SUGGESTIONS: readonly string[] = [
  'Liệt kê các file trong workspace này',
  'Tóm tắt kiến trúc của project bằng tiếng Việt',
  'Tìm chỗ có từ "tool" trong code rồi giải thích',
]

/**
 * The web client: workspace shell around a stateless chat pane. All chat
 * state derives from the session event stream — the UI holds no model state
 * of its own, mirroring "render from session/event". Provider metadata and
 * session workspace are server facts reflected into selection controls.
 */
export function App() {
  const toast = useToast()
  const [sessions, setSessions] = useState<readonly SessionListing[]>([])
  const [current, setCurrent] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [draft, setDraft] = useState('')
  const [meta, setMeta] = useState<Meta | null>(null)
  const [folderDraft, setFolderDraft] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [envOpen, setEnvOpen] = useState(() => window.innerWidth >= 1280)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<SessionListing | null>(null)

  const { events, approvals, stream, error: streamError } = useSessionStream(current)
  const running = useMemo(() => isTurnRunning(events), [events])
  const currentSession = useMemo(() => sessions.find((session) => session.id === current) ?? null, [sessions, current])
  const modelValue = useMemo(() => activeModelValue(meta), [meta])
  const availableModelOptions = useMemo(() => modelOptions(meta), [meta])

  const refreshMeta = useCallback(async () => {
    try {
      setMeta(await fetchMeta())
    } catch (cause) {
      toast.notify(String(cause))
    }
  }, [toast])

  const refreshList = useCallback(async () => {
    try {
      setSessions(await listSessions())
    } catch (cause) {
      toast.notify(String(cause))
    }
  }, [toast])

  useEffect(() => {
    void refreshMeta()
    void (async () => {
      try {
        let listing = await listSessions()
        if (listing.length === 0) {
          await createSession()
          listing = await listSessions()
        }
        setSessions(listing)
        setCurrent((existing) => existing ?? listing[0]?.id ?? null)
      } catch (cause) {
        toast.notify(String(cause))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The draft is a view of the active session's explicit folder. An inherited
  // session receives the default folder as its visible starting point; submit
  // is still session-scoped and an empty draft explicitly resets inheritance.
  useEffect(() => {
    setFolderDraft(currentSession?.folder ?? meta?.folder ?? '')
  }, [currentSession?.id, currentSession?.folder, meta?.folder])

  useEffect(() => {
    if (streamError === null) return
    toast.notify(streamError)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamError])

  const closeSidebar = useCallback(() => setSidebarOpen(false), [])
  const openSession = useCallback((id: string) => {
    setCurrent(id)
    setSidebarOpen(false)
  }, [])

  const send = useCallback(async () => {
    if (current === null || draft.trim() === '' || running || modelValue === null) return
    const content = draft
    setDraft('')
    try {
      await sendMessage(current, content)
      void refreshList()
    } catch (cause) {
      toast.notify(String(cause))
    }
  }, [current, draft, running, modelValue, refreshList, toast])

  const stop = useCallback(async () => {
    if (current === null) return
    try {
      await stopSession(current)
    } catch (cause) {
      toast.notify(String(cause))
    }
  }, [current, toast])

  const answer = useCallback(async (approvalId: string, allow: boolean) => {
    try {
      await answerApproval(approvalId, allow)
    } catch (cause) {
      toast.notify(String(cause))
    }
  }, [toast])

  const newSession = useCallback(async () => {
    try {
      const { id } = await createSession()
      await refreshList()
      setCurrent(id)
      setSidebarOpen(false)
    } catch (cause) {
      toast.notify(String(cause))
    }
  }, [refreshList, toast])

  const rename = useCallback(async (id: string, title: string) => {
    try {
      const renamed = await renameSession(id, title)
      await refreshList()
      toast.notify(`phiên đổi tên thành "${renamed.title}"`, 'ok')
    } catch (cause) {
      toast.notify(String(cause))
    }
  }, [refreshList, toast])

  const confirmDelete = useCallback(async () => {
    if (pendingDelete === null) return
    const id = pendingDelete.id
    setPendingDelete(null)
    try {
      await deleteSession(id)
      const listing = await listSessions()
      setSessions(listing)
      if (current === id) setCurrent(listing[0]?.id ?? null)
      toast.notify('đã xóa phiên', 'ok')
    } catch (cause) {
      toast.notify(String(cause))
    }
  }, [pendingDelete, current, toast])

  const applySessionFolder = useCallback(async () => {
    if (current === null) return
    try {
      const updated = await setSessionFolder(current, folderDraft.trim())
      setSessions((previous) => previous.map((session) => (
        session.id === current ? { ...session, folder: updated.folder } : session
      )))
      setFolderDraft(updated.folder ?? meta?.folder ?? '')
      toast.notify(updated.folder === null ? 'session đang dùng workspace mặc định' : `workspace session: ${updated.folder}`, 'ok')
    } catch (cause) {
      toast.notify(String(cause))
    }
  }, [current, folderDraft, meta?.folder, toast])

  const selectModel = useCallback(async (value: string) => {
    const choice = decodeModelChoice(value)
    if (choice === null) return
    try {
      setMeta(await setModel(choice.model, choice.provider))
    } catch (cause) {
      toast.notify(String(cause))
    }
  }, [toast])

  useHotkeys([
    { key: 'n', mod: true, onPress: () => void newSession() },
    { key: 'k', mod: true, onPress: () => setSidebarOpen(true) },
  ])

  const activeTitle = currentSession?.title ?? ''
  const folderLabel = (currentSession?.folder ?? meta?.folder ?? '').split(/[\\/]/).at(-1) ?? ''

  return (
    <div className={`app${sidebarOpen ? ' nav-open' : ''}${envOpen ? ' env-open' : ''}`}>
      <TopBar
        title={activeTitle}
        meta={meta}
        stream={stream}
        sidebarOpen={sidebarOpen}
        sessionFolder={currentSession?.folder ?? null}
        folderDraft={folderDraft}
        canSetFolder={current !== null}
        onFolderDraft={setFolderDraft}
        onApplyFolder={() => void applySessionFolder()}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        onToggleEnv={() => setEnvOpen((prev) => !prev)}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className="app-body">
        <Sidebar
          sessions={sessions}
          current={current}
          filter={filter}
          stream={stream}
          provider={meta?.provider ?? null}
          folderLabel={folderLabel}
          running={running}
          open={sidebarOpen}
          onFilter={setFilter}
          onSelect={openSession}
          onNew={() => void newSession()}
          onRename={(id, title) => void rename(id, title)}
          onDeleteRequest={setPendingDelete}
          onClose={closeSidebar}
        />
        <main className="chat">
          <div className="chat-area">
            {events.length === 0 ? (
              <div className="empty">
                <div className="empty-mark" aria-hidden="true">⌬</div>
                <p className="empty-title">Bắt đầu một hội thoại</p>
                <p className="empty-sub">Agent đọc file, chạy bash và xin phép trước khi thay đổi.</p>
                {modelValue === null ? <Button variant="primary" size="sm" onClick={() => setSettingsOpen(true)}>Cấu hình provider</Button> : null}
                <div className="suggestions">
                  {SUGGESTIONS.map((suggestion) => (
                    <Button
                      key={suggestion}
                      variant="outline"
                      size="sm"
                      disabled={current === null || modelValue === null}
                      onClick={() => {
                        if (current !== null) {
                          void sendMessage(current, suggestion).then(() => void refreshList())
                            .catch((cause: unknown) => toast.notify(String(cause)))
                        }
                      }}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <Transcript events={events} />
            )}
          </div>
          <ApprovalBar approvals={approvals} onAnswer={(id, allow) => void answer(id, allow)} />
          <Composer
            connected={stream === 'open'}
            running={running}
            draft={draft}
            onDraft={setDraft}
            onSend={() => void send()}
            onStop={() => void stop()}
            modelValue={modelValue}
            modelOptions={availableModelOptions}
            onModel={(value) => void selectModel(value)}
          />
        </main>
        <EnvPanel
          open={envOpen}
          meta={meta}
          stream={stream}
          sessionId={current}
          sessionFolder={currentSession?.folder ?? null}
          eventCount={events.length}
          modelValue={modelValue}
          modelOptions={availableModelOptions}
          onModel={(value) => void selectModel(value)}
        />
      </div>
      <SettingsModal
        open={settingsOpen}
        providers={meta?.providers ?? []}
        activeProvider={meta?.provider ?? ''}
        activeModel={meta?.model ?? ''}
        onDismiss={() => setSettingsOpen(false)}
        onRefresh={refreshMeta}
        onSelectActive={async (provider, model) => {
          setMeta(await setModel(model, provider))
        }}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete !== null ? `Xóa phiên "${pendingDelete.title || 'untitled'}"?` : ''}
        confirmLabel="Xóa"
        onConfirm={() => void confirmDelete()}
        onDismiss={() => setPendingDelete(null)}
      />
    </div>
  )
}
