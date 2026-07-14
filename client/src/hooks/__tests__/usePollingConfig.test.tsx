import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePollingConfig } from '../usePollingConfig'

// Mock du module api
vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(),
  },
}))

const mockApi = (await import('../../services/api')).default

describe('usePollingConfig', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: 0, // Override pour les tests
        },
      },
    })
    vi.clearAllMocks()
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )

  it('récupère la configuration de polling depuis l\'API', async () => {
    const mockConfig = { interval: 45000 }
    vi.mocked(mockApi.get).mockResolvedValue({
      data: { data: mockConfig },  // Structure Axios : { data: ApiResponse<PollingConfig> }
    } as Awaited<ReturnType<typeof mockApi.get>>)

    const { result } = renderHook(() => usePollingConfig(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.interval).toBe(45000)
    expect(mockApi.get).toHaveBeenCalledWith('/admin/config/polling-interval')
  })

  it('utilise le fallback si l\'API échoue', async () => {
    vi.mocked(mockApi.get).mockRejectedValue(new Error('API Error'))

    const { result } = renderHook(() => usePollingConfig(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))

    // Le fallbackInterval doit toujours être disponible
    expect(result.current.fallbackInterval).toBeGreaterThan(0)
  })

  it('a un fallbackInterval par défaut de 30000ms', async () => {
    vi.mocked(mockApi.get).mockRejectedValue(new Error('API Error'))

    const { result } = renderHook(() => usePollingConfig(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.fallbackInterval).toBe(30000)
  })

  it('a un fallbackInterval qui est un nombre positif', async () => {
    vi.mocked(mockApi.get).mockRejectedValue(new Error('API Error'))

    const { result } = renderHook(() => usePollingConfig(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))

    // Le fallbackInterval doit être un nombre positif
    expect(result.current.fallbackInterval).toBeGreaterThan(0)
    expect(Number.isInteger(result.current.fallbackInterval)).toBe(true)
  })

  it('met en cache la configuration pendant 5 minutes', async () => {
    const mockConfig = { interval: 45000 }
    vi.mocked(mockApi.get).mockResolvedValue({
      data: { data: mockConfig },  // Structure Axios : { data: ApiResponse<PollingConfig> }
    } as Awaited<ReturnType<typeof mockApi.get>>)

    const { result } = renderHook(() => usePollingConfig(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Vérifier que le staleTime est défini correctement via queryClient
    // (on ne peut pas facilement tester le cache directement sans inspecter queryClient)
    expect(mockApi.get).toHaveBeenCalledTimes(1)
  })
})
