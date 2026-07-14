import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useDeleteShellPart } from '../useDeleteShellPart'
import { deleteShellPart } from '../../services/shell-parts.service'

// Mirror of `useUpsertShellPart.test.tsx` — same invalidation prefixes, same
// `skipInvalidate` option. The service is mocked directly (the hook imports
// `deleteShellPart` as its `mutationFn`), so no `api` mock is needed here.
vi.mock('../../services/shell-parts.service', () => ({
  deleteShellPart: vi.fn(),
}))

const EVENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

describe('useDeleteShellPart', () => {
  let queryClient: QueryClient

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    vi.clearAllMocks()
  })

  afterEach(() => {
    queryClient.clear()
  })

  it('calls deleteShellPart and invalidates both editor-context queryKey prefixes on success', async () => {
    vi.mocked(deleteShellPart).mockResolvedValueOnce(undefined)
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteShellPart(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        ownerKind: 'event',
        ownerId: EVENT_ID,
        partKind: 'header',
      })
    })

    // react-query v5 calls mutationFn(variables, context) — assert on the
    // variables arg only (the context carries the QueryClient/meta internals).
    expect(vi.mocked(deleteShellPart).mock.calls[0][0]).toEqual({
      ownerKind: 'event',
      ownerId: EVENT_ID,
      partKind: 'header',
    })
    const calls = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey)
    expect(calls).toEqual(
      expect.arrayContaining([
        ['admin', 'editor-context', 'event', EVENT_ID],
        ['admin', 'editor-context'],
      ]),
    )
  })

  it('skipInvalidate:true neutralises the onSuccess invalidation (orchestrator owns the single final invalidate)', async () => {
    vi.mocked(deleteShellPart).mockResolvedValueOnce(undefined)
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteShellPart({ skipInvalidate: true }), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        ownerKind: 'event',
        ownerId: EVENT_ID,
        partKind: 'header',
      })
    })

    expect(deleteShellPart).toHaveBeenCalledTimes(1)
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('on rejection, surfaces isError=true and does NOT invalidate the cache', async () => {
    const error = new Error('DELETE failed')
    vi.mocked(deleteShellPart).mockRejectedValueOnce(error)
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteShellPart(), { wrapper })

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          ownerKind: 'event',
          ownerId: EVENT_ID,
          partKind: 'header',
        }),
      ).rejects.toBe(error)
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('resolves to undefined (void) on a successful DELETE', async () => {
    vi.mocked(deleteShellPart).mockResolvedValueOnce(undefined)

    const { result } = renderHook(() => useDeleteShellPart(), { wrapper })

    let resolved: unknown = 'sentinel'
    await act(async () => {
      resolved = await result.current.mutateAsync({
        ownerKind: 'event',
        ownerId: EVENT_ID,
        partKind: 'footer',
      })
    })

    expect(resolved).toBeUndefined()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})
