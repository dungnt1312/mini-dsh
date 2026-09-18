import { describe, expect, it, vi } from 'vitest'
import { getModelDefaults, getSessionModel, setModelDefaults, setSessionModel } from './api.ts'

describe('session model API', () => {
  it('gets an encoded workspace/session model route', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ provider: 'p', model: 'm', thinkingLevel: null, source: 'session' })))
    vi.stubGlobal('fetch', fetchMock)
    try {
      await expect(getSessionModel('workspace / 1', 'session / 1')).resolves.toEqual({ provider: 'p', model: 'm', thinkingLevel: null, source: 'session' })
      expect(fetchMock).toHaveBeenCalledWith('/api/workspaces/workspace%20%2F%201/sessions/session%20%2F%201/model')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('gets and writes global defaults at the global endpoint', async () => {
    const defaults = { provider: 'p', model: 'm', thinkingLevel: 'high' }
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(defaults)))
    vi.stubGlobal('fetch', fetchMock)
    try {
      await expect(getModelDefaults()).resolves.toEqual(defaults)
      await expect(setModelDefaults(defaults)).resolves.toEqual(defaults)
      expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/model-defaults')
      expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/model-defaults', expect.objectContaining({
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(defaults),
      }))
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('puts partial nullable controls without dropping explicit clears', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ provider: null, model: null, thinkingLevel: null, source: 'global' })))
    vi.stubGlobal('fetch', fetchMock)
    try {
      await setSessionModel('w', 's', { provider: null, thinkingLevel: null })
      expect(fetchMock).toHaveBeenCalledWith('/api/workspaces/w/sessions/s/model', expect.objectContaining({
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: null, thinkingLevel: null }),
      }))
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
