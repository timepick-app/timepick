import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useUpsertShellPart } from '../useUpsertShellPart'
import type { ShellPart } from '../../services/shell-parts.service'

const mockPut = vi.fn()

vi.mock('../../services/api', () => ({
  default: {
    put: (...args: unknown[]) => mockPut(...args),
  },
}))

const EVENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

const shellPartDto: ShellPart = {
  id: '11111111-1111-1111-1111-111111111111',
  ownerKind: 'event',
  ownerId: EVENT_ID,
  partKind: 'header',
  contentMjml: '<mj-section data-part-kind="header"><mj-column><mj-text>H</mj-text></mj-column></mj-section>',
  createdAt: '2026-05-16T10:00:00.000Z',
  updatedAt: '2026-05-16T10:00:00.000Z',
}

describe('useUpsertShellPart', () => {
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

  it('PUTs and invalidates both editor-context queryKey prefixes on success', async () => {
    mockPut.mockResolvedValueOnce({ data: { data: shellPartDto } })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useUpsertShellPart(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        ownerKind: 'event',
        ownerId: EVENT_ID,
        partKind: 'header',
        contentMjml: shellPartDto.contentMjml,
      })
    })

    const calls = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey)
    expect(calls).toEqual(
      expect.arrayContaining([
        ['admin', 'editor-context', 'event', EVENT_ID],
        ['admin', 'editor-context'],
      ]),
    )
    await waitFor(() => expect(result.current.data).toEqual(shellPartDto))
  })

  it('exposes isPending=true while the request is in-flight, then isSuccess=true once resolved', async () => {
    let resolvePut: ((value: { data: { data: ShellPart } }) => void) | undefined
    mockPut.mockImplementationOnce(
      () =>
        new Promise<{ data: { data: ShellPart } }>((resolve) => {
          resolvePut = resolve
        }),
    )

    const { result } = renderHook(() => useUpsertShellPart(), { wrapper })

    let mutationPromise: Promise<ShellPart>
    act(() => {
      mutationPromise = result.current.mutateAsync({
        ownerKind: 'event',
        ownerId: EVENT_ID,
        partKind: 'header',
        contentMjml: shellPartDto.contentMjml,
      })
    })

    await waitFor(() => expect(result.current.isPending).toBe(true))
    expect(result.current.isSuccess).toBe(false)

    await act(async () => {
      resolvePut!({ data: { data: shellPartDto } })
      await mutationPromise!
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.isPending).toBe(false)
  })

  it('on rejection, surfaces isError=true and does NOT invalidate the cache', async () => {
    const error = new Error('PUT failed')
    mockPut.mockRejectedValueOnce(error)
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useUpsertShellPart(), { wrapper })

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          ownerKind: 'event',
          ownerId: EVENT_ID,
          partKind: 'header',
          contentMjml: shellPartDto.contentMjml,
        }),
      ).rejects.toBe(error)
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('two sequential mutations on the same owner each trigger the invalidation pair without interleaving (last-write-wins per server contract)', async () => {
    mockPut.mockResolvedValue({ data: { data: shellPartDto } })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useUpsertShellPart(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        ownerKind: 'event',
        ownerId: EVENT_ID,
        partKind: 'header',
        contentMjml: shellPartDto.contentMjml,
      })
    })

    await act(async () => {
      await result.current.mutateAsync({
        ownerKind: 'event',
        ownerId: EVENT_ID,
        partKind: 'footer',
        contentMjml: '<mj-section data-part-kind="footer"><mj-column></mj-column></mj-section>',
      })
    })

    expect(mockPut).toHaveBeenCalledTimes(2)
    // Two mutations × two invalidations = 4 calls on the spy.
    expect(invalidateSpy.mock.calls.length).toBeGreaterThanOrEqual(4)
  })
})
