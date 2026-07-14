import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { useEditorContext } from '../useEditorContext'
import type { ResolvedShell } from '../../services/editor-context.service'

const mockGet = vi.fn()

vi.mock('../../services/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}))

const resolvedShellFixture: ResolvedShell = {
  header: { contentMjml: '<mj-section>H</mj-section>', origin: 'hardcoded' },
  body: { contentMjml: '<mj-section>B</mj-section>', origin: 'template' },
  footer: { contentMjml: '<mj-section>F</mj-section>', origin: 'hardcoded' },
  mjBody: {
    attrs: { backgroundColor: '#ffffff', paddingTop: '0', paddingBottom: '0' },
    origin: 'hardcoded',
  },
  contentWrapper: null,
}

describe('useEditorContext', () => {
  let queryClient: QueryClient
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    vi.clearAllMocks()
  })

  afterEach(() => {
    queryClient.clear()
  })

  it('fetches editor context when all 3 params are provided and exposes data on success', async () => {
    mockGet.mockResolvedValueOnce({ data: { data: resolvedShellFixture } })

    const { result } = renderHook(
      () =>
        useEditorContext({
          ownerKind: 'event',
          ownerId: 'evt-1',
          templateKey: 'invitation',
        }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(resolvedShellFixture)
    expect(mockGet).toHaveBeenCalledWith('/admin/editor-context', {
      params: { ownerKind: 'event', ownerId: 'evt-1', templateKey: 'invitation' },
    })
  })

  it('does NOT fetch when ownerKind is missing (enabled gate)', async () => {
    const { result } = renderHook(
      () =>
        useEditorContext({
          ownerKind: undefined,
          ownerId: 'evt-1',
          templateKey: 'invitation',
        }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.isPending).toBe(true))
    expect(result.current.fetchStatus).toBe('idle')
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('does NOT fetch when ownerId is missing (enabled gate)', async () => {
    const { result } = renderHook(
      () =>
        useEditorContext({
          ownerKind: 'event',
          ownerId: undefined,
          templateKey: 'invitation',
        }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('exposes the error state on rejection (retry disabled)', async () => {
    mockGet.mockRejectedValueOnce(new Error('boom'))

    const { result } = renderHook(
      () =>
        useEditorContext({
          ownerKind: 'event',
          ownerId: 'evt-1',
          templateKey: 'invitation',
        }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect((result.current.error as Error).message).toBe('boom')
    expect(mockGet).toHaveBeenCalledTimes(1)
  })
})
