import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  answerApproval,
  createSession,
  deleteSession,
  fetchMeta,
  listSessions,
  renameSession,
  sendMessage,
  setFolder,
  setModel,
  stopSession,
} from './lib/api.ts'
import { isTurnRunning } from './lib/project.ts'
import { useSessionStream } from './hooks/useSessionStream.ts'
import { useHotkeys } from './hooks/useHotkeys.ts'
import { useToast } from './components/common/Toast.tsx'
import { Button } from './components/ui/Button.tsx'
import { Sidebar } from './components/layout/Sidebar.tsx'
import { TopBar } from './components/layout/TopBar.tsx'
import { EnvPanel } from './components/layout/EnvPanel.tsx'
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
 * state derives from the session event stream — the UI holds no model
 * state of its own, mirroring "render from session/event".
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
  const [pendingDelete, setPendingDelete] = useState<SessionListing | null>(null)

  const { events, approvals, stream, error: streamError } = useSessionStream(current)
  const running = useMemo(() => isTurnRunning(events), [events])

  useEffect(() => {
    void fetchMeta().then((fetched) => {
      setMeta(fetched)
      setFolderDraft(fetched.folder)
    }).catch(() => toast.notify('không kết nối được server'))
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

  useEffect(() => {
    if (streamError === null) return
    toast.notify(streamError)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamError])

  const refreshList = useCallback(async () => {
    try {
      setSessions(await listSessions())
    } catch (cause) {
      toast.notify(String(cause))
    }
  }, [toast])

  const closeSidebar = useCallback(() => setSidebarOpen(false), [])
  const openSession = useCallback((id: string) => {
    setCurrent(id)
    setSidebarOpen(false)
  }, [])

  const send = useCallback(async () => {
    if (current === null || draft.trim() === '' || running) return
    const content = draft
    setDraft('')
    try {
      await sendMessage(current, content)
      void refreshList()
    } catch (cause) {
      toast.notify(String(cause))
    }
  }, [current, draft, running, refreshList, toast])

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
      setSessions(await listSessions())
      setCurrent(id)
      setSidebarOpen(false)
    } catch (cause) {
      toast.notify(String(cause))
    }
  }, [toast])

  const rename = useCallback(async (id: string, title: string) => {
    try {
      const renamed = await renameSession(id, title)
      setSessions(await listSessions())
      toast.notify(`phiên đổi tên thành "${renamed.title}"`, 'ok')
    } catch (cause) {
      toast.notify(String(cause))
    }
  }, [toast])

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

  const applyFolder = useCallback(async () => {
    const folder = folderDraft.trim()
    if (folder === '') return
    try {
      const updated = await setFolder(folder)
      setMeta(updated)
      setFolderDraft(updated.folder)
      toast.notify(`workspace: ${updated.folder}`, 'ok')
    } catch (cause) {
      toast.notify(String(cause))
    }
  }, [folderDraft, toast])

  const selectModel = useCallback(async (model: string) => {
    try {
      setMeta(await setModel(model))
    } catch (cause) {
      toast.notify(String(cause))
    }
  }, [toast])

  useHotkeys([
    { key: 'n', mod: true, onPress: () => void newSession() },
    { key: 'k', mod: true, onPress: () => setSidebarOpen(true) },
  ])

  const activeTitle = sessions.find((session) => session.id === current)?.title ?? ''

  return (
    <div className={`app${sidebarOpen ? ' nav-open' : ''}${envOpen ? ' env-open' : ''}`}>
      <TopBar
        title={activeTitle}
        meta={meta}
        stream={stream}
        sidebarOpen={sidebarOpen}
        folderDraft={folderDraft}
        onFolderDraft={setFolderDraft}
        onApplyFolder={() => void applyFolder()}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        onToggleEnv={() => setEnvOpen((prev) => !prev)}
      />
      <div className="app-body">
        <Sidebar
          sessions={sessions}
          current={current}
          filter={filter}
          stream={stream}
          provider={meta?.provider ?? null}
          folderLabel={meta?.folder.split(/[\\/]/).at(-1) ?? ''}
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
                <div className="suggestions">
                  {SUGGESTIONS.map((suggestion) => (
                    <Button
                      key={suggestion}
                      variant="outline"
                      size="sm"
                      disabled={current === null}
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
          />
        </main>
        <EnvPanel
          open={envOpen}
          meta={meta}
          stream={stream}
          sessionId={current}
          eventCount={events.length}
          onModel={(model) => void selectModel(model)}
        />
        <EnvPanel
          open={envOpen}
          meta={meta}
          stream={stream}
          sessionId={current}
          eventCount={events.length}
          onModel={(model) => void selectModel(model)}
        />
      </div>
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
