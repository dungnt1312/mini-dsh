import { useCallback, useEffect, useState } from 'react'

interface FilesState {
  /** Folder shown by the Files view (root-relative, '' = root). */
  readonly folder: string
  /** Opened file tabs in opening order. */
  readonly openFiles: readonly string[]
  /** The file tab in front, or null when a fixed view is showing. */
  readonly activeFile: string | null
}

export interface WorkbenchFiles extends FilesState {
  readonly setFolder: (folder: string) => void
  readonly openFile: (path: string) => void
  readonly closeFile: (path: string) => void
  readonly showFixedView: () => void
}

const EMPTY: FilesState = { folder: '', openFiles: [], activeFile: null }

/** Closing the front tab reveals its right neighbour, else its left one, else the fixed view. */
export function closeFileTab(state: FilesState, path: string): FilesState {
  const index = state.openFiles.indexOf(path)
  if (index === -1) return state
  const openFiles = state.openFiles.filter((file) => file !== path)
  const activeFile = state.activeFile !== path ? state.activeFile : openFiles[Math.min(index, openFiles.length - 1)] ?? null
  return { ...state, openFiles, activeFile }
}

/**
 * Transient file-browsing state for one project. Switching the project (or
 * to no project) resets the folder and closes its file tabs, so paths from
 * one root are never read against another.
 */
export function useWorkbenchFiles(projectKey: string | null): WorkbenchFiles {
  const [state, setState] = useState<FilesState>(EMPTY)

  useEffect(() => { setState(EMPTY) }, [projectKey])

  const setFolder = useCallback((folder: string) => setState((current) => ({ ...current, folder })), [])
  const openFile = useCallback((path: string) => setState((current) => ({
    ...current,
    openFiles: current.openFiles.includes(path) ? current.openFiles : [...current.openFiles, path],
    activeFile: path,
  })), [])
  const closeFile = useCallback((path: string) => setState((current) => closeFileTab(current, path)), [])
  const showFixedView = useCallback(() => setState((current) => ({ ...current, activeFile: null })), [])

  return { ...state, setFolder, openFile, closeFile, showFixedView }
}
